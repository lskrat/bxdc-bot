# Skill集成团队功能 - 任务清单

## 任务概览

| 序号 | 任务 | 状态 | 依赖 | 负责人 |
|------|------|------|------|--------|
| 1 | 修改 SkillVisibility 枚举，添加 TEAM 选项 | 待开始 | 无 | - |
| 2 | 修改 Skill 实体，添加 teamId 字段 | 待开始 | 1 | - |
| 3 | 修改数据库表结构，添加 team_id 字段 | 待开始 | 无 | - |
| 4 | 创建 UserTeamMapper | 待开始 | 无 | - |
| 5 | 修改 SkillService 权限判断逻辑 | 待开始 | 1, 2, 4 | - |
| 6 | 修改 SkillMapper 查询方法 | 待开始 | 1, 2 | - |
| 7 | 修改 schema-mysql.sql | 待开始 | 3 | - |
| 8 | 测试与验证 | 待开始 | 1-7 | - |

## 详细任务

### 任务 1: 修改 SkillVisibility 枚举

**目标**: 在 SkillVisibility 枚举中添加 TEAM 选项

**文件**: entity/SkillVisibility.java

**修改内容**:
`java
public enum SkillVisibility {
    PUBLIC,   // 公共对全平台可见
    PRIVATE,  // 私人仅创建者可见
    TEAM      // 团队可见（新增）
}
`

**验收标准**:
- 枚举编译通过
- TEAM 选项可被正确序列化/反序列化

---

### 任务 2: 修改 Skill 实体

**目标**: 在 Skill 实体中添加 	eamId 字段

**文件**: entity/Skill.java

**修改内容**:
`java
@TableField("team_id")
private Long teamId;

public Long getTeamId() {
    return teamId;
}

public void setTeamId(Long teamId) {
    this.teamId = teamId;
}
`

**验收标准**:
- 实体编译通过
- teamId 字段可被 MyBatis 正确映射
- teamId 在 JSON 序列化/反序列化中正常工作

---

### 任务 3: 修改数据库表结构

**目标**: 在 skills 表中添加 	eam_id 字段（不创建外键）

**执行方式**: 运行 SQL 脚本

`sql
ALTER TABLE skills 
ADD COLUMN team_id BIGINT NULL AFTER created_by;

CREATE INDEX idx_skills_team_id ON skills(team_id);
`

**验收标准**:
- skills 表包含 team_id 字段
- team_id 字段为可空
- 索引创建成功

---

### 任务 4: 创建 UserTeamMapper

**目标**: 创建 UserTeamMapper 用于查询团队信息

**文件**: mapper/UserTeamMapper.java

**内容**:
`java
package com.lobsterai.skillgateway.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.lobsterai.skillgateway.entity.UserTeam;
import org.apache.ibatis.annotations.Mapper;

import java.util.Optional;

@Mapper
public interface UserTeamMapper extends BaseMapper<UserTeam> {
    
    default Optional<UserTeam> findById(Long id) {
        return Optional.ofNullable(selectById(id));
    }
}
`

**验收标准**:
- Mapper 编译通过
- 可通过 Spring DI 注入

---

### 任务 5: 修改 SkillService 权限判断逻辑

**目标**: 修改 canViewSkill 和 canWriteSkill 方法支持团队权限

**文件**: service/SkillService.java

**修改内容**:

1. 注入 UserTeamMapper
`java
private final UserTeamMapper userTeamMapper;

public SkillService(SkillMapper skillMapper, ObjectMapper objectMapper, UserTeamMapper userTeamMapper) {
    this.skillMapper = skillMapper;
    this.objectMapper = objectMapper;
    this.userTeamMapper = userTeamMapper;
}
`

2. 修改 canViewSkill 方法
`java
private boolean canViewSkill(Skill skill, String userId) {
    if (skill.getVisibility() == SkillVisibility.PUBLIC) {
        return true;
    }
    if (userId == null || StringUtils.isBlank(userId)) {
        return false;
    }
    if (skill.getVisibility() == SkillVisibility.PRIVATE) {
        return userId.equals(skill.getCreatedBy());
    }
    if (skill.getVisibility() == SkillVisibility.TEAM && skill.getTeamId() != null) {
        return isUserInTeam(userId, skill.getTeamId());
    }
    return false;
}
`

3. 修改 canWriteSkill 方法
`java
private boolean canWriteSkill(Skill skill, String userId) {
    if (userId == null || StringUtils.isBlank(userId)) {
        return false;
    }
    if (skill.getVisibility() == SkillVisibility.PRIVATE) {
        return userId.equals(skill.getCreatedBy());
    }
    if (PLATFORM_PUBLIC_AUTHOR.equals(skill.getCreatedBy())) {
        return SKILL_PLATFORM_ADMIN_USER_ID.equals(userId);
    }
    if (skill.getVisibility() == SkillVisibility.TEAM) {
        if (userId.equals(skill.getCreatedBy())) {
            return true;
        }
        return isUserTeamCreator(userId, skill.getTeamId());
    }
    return userId.equals(skill.getCreatedBy());
}
`

4. 添加辅助方法
`java
private boolean isUserInTeam(String userId, Long teamId) {
    return userTeamMapper.findById(teamId)
            .map(team -> {
                String members = team.getMembers();
                return members != null && members.contains(userId);
            })
            .orElse(false);
}

private boolean isUserTeamCreator(String userId, Long teamId) {
    return userTeamMapper.findById(teamId)
            .map(team -> userId.equals(team.getCreatorId()))
            .orElse(false);
}
`

5. 修改 createSkill 方法添加校验
`java
public Skill createSkill(Skill skill, String userId) {
    // ... 现有校验
    
    if (SkillVisibility.TEAM.equals(skill.getVisibility())) {
        if (skill.getTeamId() == null) {
            throw new IllegalArgumentException("TEAM visibility requires a team_id");
        }
        if (!userTeamMapper.exists(new LambdaQueryWrapper<UserTeam>()
                .eq(UserTeam::getId, skill.getTeamId())
                .eq(UserTeam::getIsDeleted, 0))) {
            throw new IllegalArgumentException("Team not found");
        }
        if (!isUserInTeam(userId, skill.getTeamId())) {
            throw new IllegalArgumentException("User is not a member of the specified team");
        }
    } else {
        skill.setTeamId(null);
    }
    
    // ... 保存逻辑
}
`

6. 修改 updateSkill 方法添加校验
`java
public Skill updateSkill(Long id, Skill skillDetails, String userId) {
    // ... 现有逻辑
    
    if (skillDetails.getVisibility() != null) {
        skill.setVisibility(skillDetails.getVisibility());
        
        if (SkillVisibility.TEAM.equals(skillDetails.getVisibility())) {
            if (skillDetails.getTeamId() == null) {
                throw new IllegalArgumentException("TEAM visibility requires a team_id");
            }
            if (!userTeamMapper.exists(new LambdaQueryWrapper<UserTeam>()
                    .eq(UserTeam::getId, skillDetails.getTeamId())
                    .eq(UserTeam::getIsDeleted, 0))) {
                throw new IllegalArgumentException("Team not found");
            }
            skill.setTeamId(skillDetails.getTeamId());
        } else {
            skill.setTeamId(null);
        }
    }
    
    // ... 更新逻辑
}
`

**验收标准**:
- Service 编译通过
- TEAM 技能的权限校验正确
- 创建/更新 TEAM 技能时校验团队存在性和成员身份

---

### 任务 6: 修改 SkillMapper 查询方法

**目标**: 修改 indVisibleSummaryForUser 方法支持团队技能查询

**文件**: mapper/SkillMapper.java

**修改内容**:
`java
default List<Skill> findVisibleSummaryForUser(String userId) {
    return selectList(new LambdaQueryWrapper<Skill>()
            .eq(Skill::getVisibility, SkillVisibility.PUBLIC)
            .or(w -> w.eq(Skill::getVisibility, SkillVisibility.PRIVATE)
                    .eq(Skill::getCreatedBy, userId))
            .or(w -> w.eq(Skill::getVisibility, SkillVisibility.TEAM)
                    .inSql(Skill::getTeamId, 
                        "SELECT id FROM user_team WHERE members LIKE CONCAT('%', ?, '%') AND is_deleted = 0", userId)));
}
`

**验收标准**:
- Mapper 编译通过
- 用户可查询到自己所属团队的技能

---

### 任务 7: 修改 schema-mysql.sql

**目标**: 更新数据库初始化脚本

**文件**: esources/schema-mysql.sql

**修改内容**:
`sql
CREATE TABLE IF NOT EXISTS skills (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    type VARCHAR(255) NOT NULL,
    configuration TEXT,
    schema_properties TEXT,
    execution_mode VARCHAR(255) DEFAULT 'CONFIG',
    enabled TINYINT(1) DEFAULT 1,
    requires_confirmation TINYINT(1) NOT NULL DEFAULT 0,
    visibility VARCHAR(16) NOT NULL DEFAULT 'PUBLIC',
    avatar VARCHAR(32),
    created_by VARCHAR(128),
    team_id BIGINT NULL,  -- 新增字段
    intro_md TEXT,
    created_at DATETIME,
    updated_at DATETIME,
    INDEX idx_skills_team_id (team_id)  -- 新增索引
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`

**验收标准**:
- 脚本语法正确
- 新建数据库时包含 team_id 字段

---

### 任务 8: 测试与验证

**目标**: 验证功能正确性

**测试用例**:

| 测试场景 | 操作步骤 | 预期结果 |
|----------|----------|----------|
| 创建 TEAM 技能 | POST /api/skills，visibility=TEAM，teamId=1 | 创建成功，teamId 正确保存 |
| 创建 TEAM 技能无 teamId | POST /api/skills，visibility=TEAM，teamId=null | 返回 400 错误 |
| 创建 TEAM 技能团队不存在 | POST /api/skills，visibility=TEAM，teamId=999 | 返回 400 错误 |
| 创建 TEAM 技能非成员 | POST /api/skills，visibility=TEAM，用户非成员 | 返回 403 错误 |
| 查询技能列表 | GET /api/skills | 返回 PUBLIC + PRIVATE + TEAM成员技能 |
| 团队成员查看 TEAM 技能 | GET /api/skills/{id}，用户是成员 | 返回技能详情 |
| 非成员查看 TEAM 技能 | GET /api/skills/{id}，用户非成员 | 返回 404 |
| 创建者修改 TEAM 技能 | PUT /api/skills/{id}，用户是创建者 | 修改成功 |
| 团队创建者修改 TEAM 技能 | PUT /api/skills/{id}，用户是团队创建者 | 修改成功 |
| 普通成员修改 TEAM 技能 | PUT /api/skills/{id}，用户是普通成员 | 返回 403 |

**验收标准**:
- 所有测试用例通过
- 无回归问题

---

## 任务完成标准

1. 所有代码文件编译通过
2. 数据库表结构更新完成
3. 权限逻辑正确
4. API 功能正常
5. 测试用例全部通过
