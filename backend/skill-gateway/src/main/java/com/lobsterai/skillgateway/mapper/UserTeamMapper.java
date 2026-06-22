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
