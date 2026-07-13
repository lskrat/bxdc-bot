#!/usr/bin/env python3
"""
check-missing-migrations.py

扫描改过 schema-mysql.sql 的 commit，找出"改了已有表（加列/加索引/改列）
但没同步加 Java migration"的违规 commit。

背景（AGENTS.md 5.3）：
  schema 变更优先用 Java migration 类（SchemaMigrationRunner）补齐，
  不在多个增量 commit 里改 schema-mysql.sql 让用户手动 mysql -e 跑。

判定规则（一个 commit 被标记为 ⚠️ 违规需同时满足）：
  1. schema-mysql.sql 的 diff 里出现"改已有表"特征
  2. 同 commit 没改 SchemaMigrationRunner.java

"改已有表"的识别（覆盖三种情况）：
  a) 在已有 CREATE TABLE 块内增加列定义（最常见，ca49ce3、b68b381、cf21bda 都属此类）
  b) 在已有 CREATE TABLE 块内增加 INDEX 索引
  c) 独立 ALTER TABLE ... ADD COLUMN / ADD INDEX / MODIFY / DROP 语句

用法：
  cd /Users/dccb/botproject/fishtank
  python3 backend/skill-gateway/scripts/check-missing-migrations.py

退出码：
  0 - 无违规
  1 - 至少一个违规 commit
  2 - 执行错误
"""

import re
import subprocess
import sys
from pathlib import Path

# === 路径配置 ===
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent
SCHEMA_FILE = "backend/skill-gateway/src/main/resources/schema-mysql.sql"
MIGRATION_FILE = (
    "backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/"
    "config/SchemaMigrationRunner.java"
)

# === commit message 关键词：用于"显式信号"标注（不影响违规判断）===
KEYWORDS_REGEX = re.compile(
    r"加列|加字段|加索引|新增列|新增字段|新增索引|添加列|添加字段|添加索引|"
    r"新增建表|添加.*列|添加.*字段|添加.*索引|"
    r"add column|add index|alter table|drop column|drop index|modify column|建表"
)

# === 已有表改动特征（覆盖 3 种情况） ===
# a) 在 CREATE TABLE 块内增加列定义：缩进 + 名字 + 类型
INNER_COLUMN_REGEX = re.compile(
    r"^\s*[\+\-]\s+(?P<col>[a-z_][a-z0-9_]*)\s+"
    r"(?P<type>BIGINT|VARCHAR|INT|TEXT|TINYINT|DATETIME|JSON|LONGTEXT|MEDIUMTEXT|DECIMAL|"
    r"DOUBLE|FLOAT|BLOB|CHAR|"
    r"BIGINT\s*\(\d+\)|VARCHAR\s*\(\d+\)|INT\s*\(\d+\)|TINYINT\s*\(\d+\)|"
    r"DECIMAL\s*\([^)]+\)|CHAR\s*\(\d+\))"
)

# b) 在 CREATE TABLE 块内增加索引定义
INNER_INDEX_REGEX = re.compile(
    r"^\s*[\+\-]\s+(?P<kind>UNIQUE\s+INDEX|UNIQUE\s+KEY|FULLTEXT\s+INDEX|INDEX|KEY)\s+"
    r"(?P<name>[a-z_][a-z0-9_]*)"
)

# c) 独立 ALTER TABLE / MODIFY / DROP 语句
ALTER_STATEMENT_REGEX = re.compile(
    r"^\s*[\+\-]\s+(ALTER TABLE|MODIFY COLUMN|DROP COLUMN|DROP INDEX|RENAME TO|ADD COLUMN|ADD INDEX)\b"
)


def run(cmd, cwd=None, check=True, capture=True):
    """Run shell command, return stdout."""
    result = subprocess.run(
        cmd,
        shell=isinstance(cmd, str),
        cwd=cwd or str(PROJECT_ROOT),
        capture_output=capture,
        text=True,
    )
    if check and result.returncode != 0:
        raise RuntimeError(f"Command failed: {cmd}\n{result.stderr}")
    return result.stdout


def git(*args, check=True):
    return run(["git", *args], check=check).strip()


def parse_tables(sql: str) -> dict:
    """
    Parse schema-mysql.sql, return:
      {
        'table_name': {
          'columns': {col_name: type, ...},
          'indexes': {idx_name: ...},
        },
        ...
      }
    """
    tables = {}
    current_table = None
    in_table = False
    # 列类型关键字（用于判断一行是不是列定义）
    type_kw = (
        r"BIGINT|VARCHAR|INT|TEXT|TINYINT|DATETIME|JSON|LONGTEXT|MEDIUMTEXT|"
        r"DECIMAL|DOUBLE|FLOAT|BLOB|CHAR"
    )

    for line in sql.splitlines():
        # CREATE TABLE IF NOT EXISTS xxx (
        m = re.match(r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\(", line)
        if m:
            current_table = m.group(1)
            tables[current_table] = {"columns": {}, "indexes": {}}
            in_table = True
            continue
        # 结束表定义：) ENGINE=
        if in_table and re.match(r"\)\s*ENGINE\s*=", line):
            in_table = False
            current_table = None
            continue
        if not in_table or not current_table:
            continue
        # 跳过纯注释
        stripped = line.strip()
        if not stripped or stripped.startswith("--") or stripped.startswith("#"):
            continue
        # 尝试匹配列定义：列名 + 类型（可能带 NOT NULL / DEFAULT / COMMENT 后续）
        col_m = re.match(
            rf"^\s+([a-z_][a-z0-9_]*)\s+({type_kw}(?:\s*\(\d+(?:,\s*\d+)?\))?)", line, re.IGNORECASE
        )
        if col_m:
            col_name = col_m.group(1).lower()
            if col_name not in ("primary", "unique", "key", "index", "fulltext"):
                tables[current_table]["columns"][col_name] = col_m.group(2)
            continue
        # 尝试匹配索引
        idx_m = re.match(
            r"^\s+(UNIQUE\s+INDEX|UNIQUE\s+KEY|FULLTEXT\s+INDEX|INDEX|KEY)\s+"
            r"([a-z_][a-z0-9_]*|PRIMARY)",
            line,
            re.IGNORECASE,
        )
        if idx_m:
            idx_name = idx_m.group(2).lower()
            if idx_name != "primary":
                tables[current_table]["indexes"][idx_name] = idx_m.group(1)
    return tables


def get_schema_at(commit: str) -> str:
    """Get schema-mysql.sql content at a given commit."""
    try:
        return git("show", f"{commit}:{SCHEMA_FILE}")
    except RuntimeError:
        return ""


def is_merge_commit(commit: str) -> bool:
    """Check if commit is a merge commit (more than 1 parent)."""
    parents = git("rev-parse", f"{commit}^@", check=False)
    return len(parents.split()) > 1


def get_commit_info(commit: str) -> dict:
    """Get commit metadata: short hash, date, author, subject."""
    fmt = "%H%n%h%n%ad%n%an%n%s"
    out = git("log", "-1", f"--format={fmt}", "--date=short", commit)
    lines = out.split("\n")
    return {
        "hash": lines[0],
        "short": lines[1],
        "date": lines[2],
        "author": lines[3],
        "subject": lines[4] if len(lines) > 4 else "",
    }


def get_commit_files(commit: str) -> list:
    """Get list of files changed in commit."""
    out = git("show", "--name-only", "--format=", commit)
    return [f for f in out.split("\n") if f]


def get_commit_body(commit: str) -> str:
    """Get commit message body (excluding subject)."""
    out = git("log", "-1", "--format=%b", commit)
    return out.strip()


def main():
    # 拿到所有改过 schema-mysql.sql 的 commit（时间正序，从旧到新）
    commits = git(
        "log", "--reverse", "--format=%H", "--", SCHEMA_FILE
    ).split("\n")
    commits = [c for c in commits if c]

    if not commits:
        print(f"❌ No commits found for {SCHEMA_FILE}")
        return 2

    print("=" * 50)
    print(" Schema Migration Compliance Scanner")
    print(f" Schema:    {SCHEMA_FILE}")
    print(f" Migration: {MIGRATION_FILE}")
    print(f" Commits scanned: {len(commits)}")
    print("=" * 50)
    print()

    violations = []
    total_schema_changes = 0

    for commit in commits:
        # === 过滤 1: merge commit 跳过 ===
        if is_merge_commit(commit):
            continue

        info = get_commit_info(commit)
        subject = info["subject"]
        body = get_commit_body(commit)
        full_msg = f"{subject} {body}"

        # === 核心判断 1: 改已有表判断 ===
        # 拿 commit 前后的 schema-mysql.sql，对比每个表的列/索引数量
        prev_sql = get_schema_at(f"{commit}^")
        curr_sql = get_schema_at(commit)

        if not prev_sql or not curr_sql:
            # 父 commit 不存在（root commit）或文件不存在，跳过
            continue

        prev_tables = parse_tables(prev_sql)
        curr_tables = parse_tables(curr_sql)

        changes = []  # 列出改了哪些表的哪些列/索引
        for table, curr_def in curr_tables.items():
            if table not in prev_tables:
                # 新表，不算"改已有表"
                continue
            prev_def = prev_tables[table]

            # 比列
            for col in curr_def["columns"]:
                if col not in prev_def["columns"]:
                    changes.append(f"{table}.{col} (列新增)")
            # 比索引
            for idx in curr_def["indexes"]:
                if idx not in prev_def["indexes"]:
                    changes.append(f"{table}.{idx} (索引新增)")

        # 独立 ALTER TABLE 语句
        try:
            diff_out = git("show", commit, "--", SCHEMA_FILE)
            for line in diff_out.splitlines():
                if ALTER_STATEMENT_REGEX.match(line):
                    # 提取表名
                    m = re.search(r"(?:ALTER TABLE|MODIFY COLUMN|DROP COLUMN|DROP INDEX)\s+`?(\w+)`?", line, re.IGNORECASE)
                    if m:
                        tbl = m.group(1)
                        changes.append(f"{tbl} (ALTER 语句: {line.strip()})")
        except RuntimeError:
            pass

        if not changes:
            continue  # 这个 commit 没改已有表

        total_schema_changes += 1

        # === 核心判断 2: 同 commit 是否改了 SchemaMigrationRunner.java ===
        files_changed = get_commit_files(commit)
        has_migration = MIGRATION_FILE in files_changed

        # === 显式信号标注 ===
        explicit_signal = ""
        if KEYWORDS_REGEX.search(full_msg):
            explicit_signal = "  📌 msg 显式提到加字段/索引"

        if has_migration:
            status = "✅"
        else:
            status = "⚠️ 缺 migration"
            violations.append((info, changes))

        # 输出报告
        print(f"[{info['short']}] {info['date']} {info['author']}")
        print(f"  msg:    {subject}")
        print(f"  status: {status}{explicit_signal}")
        if not has_migration:
            print(f"  altered:")
            for c in changes[:20]:  # 最多显示 20 条
                print(f"    - {c}")
        print()

    print("=" * 50)
    print(" 扫描汇总")
    print("=" * 50)
    print(f" 改已有表的 commit 总数: {total_schema_changes}")
    print(f" 违规 commit 数:        {len(violations)}")
    print()
    print(" 解释：")
    print(" - '✅'              = commit 已同步加 Java migration（合规）")
    print(" - '⚠️ 缺 migration' = commit 改了已有表结构但没加 Java migration（违规）")
    print("                        老用户必须手动跑 ALTER 才能升级，违反 AGENTS.md 5.3")
    print(" - '📌 msg 显式提到'  = commit message 明确提到加字段/索引（提醒 reviewer 注意）")
    print()

    if violations:
        print(f"⚠️  发现 {len(violations)} 个违规 commit，请到 SchemaMigrationRunner.java 补 migration")
        print()
        print(" 修复示例（ca49ce3 为例）：")
        if violations:
            sample = violations[0]
            print(f"  # 看 {sample[0]['short']} 改了哪些列：")
            print(f"  git show {sample[0]['hash']} -- {SCHEMA_FILE}")
            print()
            print(f"  # 然后在 SchemaMigrationRunner.migrateXxx 里加 ensureColumn / ensureIndex")
        print()
        return 1
    else:
        print("✅ 所有改 schema 的 commit 都有对应 Java migration")
        return 0


if __name__ == "__main__":
    sys.exit(main())
