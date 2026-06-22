package com.lobsterai.skillgateway.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.lobsterai.skillgateway.entity.UserTeam;
import com.lobsterai.skillgateway.mapper.UserTeamMapper;
import com.lobsterai.skillgateway.util.StringUtils;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
public class UserTeamService {

    private final UserTeamMapper userTeamMapper;

    public UserTeamService(UserTeamMapper userTeamMapper) {
        this.userTeamMapper = userTeamMapper;
    }

    public UserTeam createUserTeam(String teamName, String members, String creatorId) {
        if (StringUtils.isBlank(teamName)) {
            throw new IllegalArgumentException("团队名称不能为空");
        }
        if (StringUtils.isBlank(creatorId)) {
            throw new IllegalArgumentException("创建人ID不能为空");
        }

        UserTeam userTeam = new UserTeam();
        userTeam.setTeamName(teamName.trim());
        userTeam.setMembers(members != null ? members.trim() : null);
        userTeam.setCreatorId(creatorId);
        userTeam.setCreatedAt(LocalDateTime.now());
        userTeam.setIsDeleted(0);

        userTeamMapper.insert(userTeam);
        return userTeam;
    }

    public UserTeam updateUserTeam(Long id, String teamName, String members, String updaterId) {
        UserTeam userTeam = userTeamMapper.selectByIdAndNotDeleted(id);
        if (userTeam == null) {
            throw new IllegalArgumentException("团队不存在");
        }

        if (!StringUtils.isBlank(teamName)) {
            userTeam.setTeamName(teamName.trim());
        }
        if (members != null) {
            userTeam.setMembers(members.trim());
        }
        userTeam.setUpdaterId(updaterId);
        userTeam.setUpdatedAt(LocalDateTime.now());

        userTeamMapper.updateById(userTeam);
        return userTeam;
    }

    public void deleteUserTeam(Long id) {
        UserTeam userTeam = userTeamMapper.selectByIdAndNotDeleted(id);
        if (userTeam == null) {
            throw new IllegalArgumentException("团队不存在");
        }

        userTeam.setIsDeleted(1);
        userTeam.setUpdatedAt(LocalDateTime.now());
        userTeamMapper.updateById(userTeam);
    }

    public UserTeam getUserTeamById(Long id) {
        return userTeamMapper.selectByIdAndNotDeleted(id);
    }

    public IPage<UserTeam> getUserTeamsByCreatorId(String creatorId, int page, int size) {
        if (StringUtils.isBlank(creatorId)) {
            throw new IllegalArgumentException("创建人ID不能为空");
        }
        if (page < 1) {
            page = 1;
        }
        if (size < 1 || size > 100) {
            size = 20;
        }
        return userTeamMapper.selectByCreatorIdPaged(creatorId, page, size);
    }
}
