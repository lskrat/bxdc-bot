package com.lobsterai.skillgateway.service;

import org.springframework.stereotype.Service;

import java.util.regex.Pattern;

/**
 * 安全过滤服务。
 * <p>
 * 提供对命令的安全性检查，防止高危操作。
 * 黑名单覆盖：文件系统破坏、系统控制、进程终止、远程执行、权限变更、
 * 用户管理、防火墙/网络破坏、crontab 注入、资源耗尽、内核模块操作。
 * </p>
 */
@Service
public class SecurityFilterService {

    // 危险命令黑名单（按类别分组，用 | 连接为单一正则）
    private static final Pattern DANGEROUS_COMMANDS = Pattern.compile(
        // 1) 文件系统破坏：强制删除、格式化、覆写磁盘
        "rm\\s+-r[fv]"                                      // rm -rf / rm -r / rm -rv
        + "|rm\\s+.*\\s+-r[fv]"                             // rm /some/path -rf
        + "|rm\\s+-[^\\s]*r[^\\s]*f"                        // rm -fr / -xrf 等变体
        + "|>\\s*/dev/sd[a-z]"                              // 直接覆写磁盘设备
        + "|dd\\s+.*of=/dev/sd"                             // dd of=/dev/sda
        + "|mkfs\\.?"                                        // mkfs / mkfs.ext4 / mkfs.xfs 等
        + "|mkswap|wipefs"                                  // 格式化 swap / 擦除文件系统签名
        + "|fdisk\\s|parted\\s|partprobe"                   // 磁盘分区操作

        // 2) 系统控制：关机/重启
        + "|shutdown\\s|reboot\\s|halt\\s|poweroff\\s"      // 关机/重启命令
        + "|init\\s+[06]\\s"                                // init 0 / init 6
        + "|systemctl\\s+(halt|poweroff|reboot|shutdown|suspend|hibernate)"  // systemctl 关机
        + "|telinit\\s+[06]"                                // telinit 0 / 6

        // 3) 进程终止：高危 kill 操作
        + "|kill\\s+-9"                                     // kill -9
        + "|killall\\s+-9"                                  // killall -9
        + "|pkill\\s+-9"                                    // pkill -9
        + "|kill\\s+-[^\\s]*KILL"                           // kill --signal=KILL

        // 4) 远程下载并执行：管道执行
        + "|curl\\s+.*\\|\\s*(ba)?sh"                       // curl xxx | sh / curl xxx | bash
        + "|wget\\s+.*-O\\s*-\\s*\\|\\s*(ba)?sh"           // wget xxx -O - | sh
        + "|wget\\s+.*\\|\\s*(ba)?sh"                       // wget xxx | sh

        // 5) 权限/所有权变更（系统级破坏）
        + "|chmod\\s+[0-7]*7[0-7]*7\\s+/"                  // chmod 777 /etc/xxx（三位都有 7）
        + "|chmod\\s+-R\\s+[0-7]*7[0-7]*7\\s+/"            // chmod -R 777 /xxx
        + "|chown\\s+-R\\s+[^\\s]+\\s+/"                    // chown -R someone /
        + "|chattr\\s+-i"                                   // chattr -i（解除不可变，常为破坏前奏）

        // 6) 用户/认证管理
        + "|useradd\\s|userdel\\s"                          // 增加/删除用户
        + "|usermod\\s+-a?G\\s+(wheel|sudo|root)"          // 加入管理员组
        + "|passwd\\s+(?!-)"                                // passwd 命令（非 passwd --status 等查询）

        // 7) 防火墙/网络破坏
        + "|iptables\\s+-F|iptables\\s+--flush"             // 清空防火墙规则
        + "|iptables\\s+-P\\s+(INPUT|OUTPUT|FORWARD)\\s+(ACCEPT|DROP)" // 修改默认策略
        + "|ufw\\s+disable|firewall-cmd\\s+--permanent\\s+--remove" // 禁用防火墙

        // 8) crontab 注入 / 持久化后门
        + "|crontab\\s+-[^\\s]*[re]|crontab\\s+.*\\|"      // crontab -e / -r / 管道写入

        // 9) 资源耗尽攻击
        + "|:\\(\\)\\s*\\{\\s*:\\|:&\\s*\\}\\s*;\\s*:"     // fork bomb
        + "|yes\\s+>\\s*/dev"                               // yes > /dev/null 无限写
        + "|cat\\s+/dev/(zero|urandom)\\s+>\\s+/dev/sd"     // 无限覆写磁盘

        // 10) 内核模块操作
        + "|modprobe\\s|insmod\\s|rmmod\\s"                 // 内核模块加载/卸载
        + "|sysctl\\s+-w"                                   // 运行时内核参数修改
    );

    /**
     * 检查命令是否安全。
     *
     * @param command 待检查的命令
     * @return 如果命令安全则返回 true，否则返回 false
     */
    public boolean isCommandSafe(String command) {
        return !DANGEROUS_COMMANDS.matcher(command).find();
    }
}
