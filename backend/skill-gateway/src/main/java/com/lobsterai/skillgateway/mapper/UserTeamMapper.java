package com.lobsterai.skillgateway.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.lobsterai.skillgateway.entity.UserTeam;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface UserTeamMapper extends BaseMapper<UserTeam> {

    default Page<UserTeam> selectByCreatorIdPaged(String creatorId, int page, int size) {
        Page<UserTeam> p = new Page<>(page, size);
        LambdaQueryWrapper<UserTeam> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(UserTeam::getCreatorId, creatorId)
               .eq(UserTeam::getIsDeleted, 0)
               .orderByDesc(UserTeam::getCreatedAt);
        return selectPage(p, wrapper);
    }

    default UserTeam selectByIdAndNotDeleted(Long id) {
        LambdaQueryWrapper<UserTeam> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(UserTeam::getId, id)
               .eq(UserTeam::getIsDeleted, 0);
        return selectOne(wrapper);
    }
}
