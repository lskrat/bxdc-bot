package com.lobsterai.skillgateway.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.lobsterai.skillgateway.entity.Skill;
import com.lobsterai.skillgateway.entity.SkillVisibility;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;
import java.util.Optional;

@Mapper
public interface SkillMapper extends BaseMapper<Skill> {

    default Optional<Skill> findByName(String name) {
        return Optional.ofNullable(selectOne(new LambdaQueryWrapper<Skill>().eq(Skill::getName, name)));
    }

    default int updateIntroMdById(Long id, String introMd) {
        return update(null, new LambdaUpdateWrapper<Skill>()
                .eq(Skill::getId, id)
                .set(Skill::getIntroMd, introMd));
    }

    default List<Skill> findAllPublicSummary() {
        return selectList(new LambdaQueryWrapper<Skill>()
                .eq(Skill::getVisibility, SkillVisibility.PUBLIC));
    }

    default List<Skill> findVisibleSummaryForUser(String userId) {
        return selectList(new QueryWrapper<Skill>()
                .eq("visibility", SkillVisibility.PUBLIC)
                .or(w -> w.eq("visibility", SkillVisibility.PRIVATE)
                        .eq("created_by", userId))
                .or(w -> w.eq("visibility", SkillVisibility.TEAM)
                        .apply("EXISTS (SELECT 1 FROM user_team ut WHERE ut.is_deleted = 0 AND ut.members LIKE CONCAT('%', ?, '%') AND FIND_IN_SET(ut.id, skills.team_id) > 0)", userId)));
    }

    default List<Skill> findVisibleSummaryForUserByOwnerType(String userId, Integer ownerType) {
        return selectList(new QueryWrapper<Skill>()
                .eq("skill_owner_type", ownerType)
                .and(w -> w.eq("visibility", SkillVisibility.PUBLIC)
                        .or(w2 -> w2.eq("visibility", SkillVisibility.PRIVATE)
                                .eq("created_by", userId))
                        .or(w2 -> w2.eq("visibility", SkillVisibility.TEAM)
                                .apply("EXISTS (SELECT 1 FROM user_team ut WHERE ut.is_deleted = 0 AND ut.members LIKE CONCAT('%', ?, '%') AND FIND_IN_SET(ut.id, skills.team_id) > 0)", userId))));
    }

    default List<Skill> findBySkillOwnerTypeAndEnabledIsTrue(Integer ownerType) {
        return selectList(new QueryWrapper<Skill>()
                .eq("skill_owner_type", ownerType)
                .eq("enabled", true));
    }
}
