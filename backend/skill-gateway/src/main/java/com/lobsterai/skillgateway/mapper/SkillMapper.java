package com.lobsterai.skillgateway.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.lobsterai.skillgateway.entity.Skill;
import com.lobsterai.skillgateway.entity.SkillVisibility;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

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
                        .apply("EXISTS (SELECT 1 FROM user_team ut WHERE ut.is_deleted = 0 AND ut.members LIKE CONCAT('%', {0}, '%') AND FIND_IN_SET(ut.id, skills.team_id) > 0)", userId)));
    }

    default List<Skill> findVisibleSummaryForUserByOwnerType(String userId, Integer ownerType) {
        return selectList(new QueryWrapper<Skill>()
                .eq("skill_owner_type", ownerType)
                .and(w -> w.eq("visibility", SkillVisibility.PUBLIC)
                        .or(w2 -> w2.eq("visibility", SkillVisibility.PRIVATE)
                                .eq("created_by", userId))
                        .or(w2 -> w2.eq("visibility", SkillVisibility.TEAM)
                                .apply("EXISTS (SELECT 1 FROM user_team ut WHERE ut.is_deleted = 0 AND ut.members LIKE CONCAT('%', {0}, '%') AND FIND_IN_SET(ut.id, skills.team_id) > 0)", userId))));
    }

    default List<Skill> findBySkillOwnerTypeAndEnabledIsTrue(Integer ownerType) {
        return selectList(new QueryWrapper<Skill>()
                .eq("skill_owner_type", ownerType)
                .eq("enabled", true));
    }

    /**
     * 按 ID 列表查询「该用户可见 + enabled=true」的技能（主 Agent 加载会话勾选技能用）。
     * 可见性规则与 {@link #findVisibleSummaryForUserByOwnerType} 一致：PUBLIC / 自己创建的 PRIVATE / 所在 TEAM。
     */
    default List<Skill> findVisibleEnabledSummaryForUserByIds(String userId, List<Long> ids) {
        return selectList(new QueryWrapper<Skill>()
                .in("id", ids)
                .eq("enabled", true)
                .and(w -> w.eq("visibility", SkillVisibility.PUBLIC)
                        .or(w2 -> w2.eq("visibility", SkillVisibility.PRIVATE)
                                .eq("created_by", userId))
                        .or(w2 -> w2.eq("visibility", SkillVisibility.TEAM)
                                .apply("EXISTS (SELECT 1 FROM user_team ut WHERE ut.is_deleted = 0 AND ut.members LIKE CONCAT('%', {0}, '%') AND FIND_IN_SET(ut.id, skills.team_id) > 0)", userId))));
    }

    /**
     * add-skill-tags-and-intent-filtering：SQL 硬筛 SQL。
     * <p>
     * 查询语义：tags 任一值出现在 file_type / operation_intent / business_scenario 任一列
     * 即视为命中；外加 owner_type + enabled + search_weight>0 与 e2ac8ce 的 loadIndex 行为对齐。
     * </p>
     * <p>
     * 注意：tags 的 null/空集合 SQL 会注入空 IN 列表，调用方必须先校验非空再调用
     * （skillEmbeddingService.match() 内部已校验）。agent-core 不传 tags 字段时
     * SkillMatchRequest.getTags() 返回 null，整个三阶段管线不走到本方法。
     * </p>
     */
    @Select({
        "<script>",
        "SELECT DISTINCT id FROM skills",
        "WHERE skill_owner_type = #{ownerType}",
        "  AND enabled = 1",
        "  AND (search_weight IS NULL OR search_weight > 0)",
        "  AND (",
        "    file_type IN ",
        "    <foreach collection=\"tags\" item=\"t\" open=\"(\" separator=\",\" close=\")\">",
        "      #{t}",
        "    </foreach>",
        // operation_intent 列里多值用 "," 分隔（FileToolSeeder.joinOperationIntent），
        // 同时支持 IN 精确匹配（单值）和 FIND_IN_SET 子段匹配（多值）。任一命中即入选。
        "    OR operation_intent IN ",
        "    <foreach collection=\"tags\" item=\"t\" open=\"(\" separator=\",\" close=\")\">",
        "      #{t}",
        "    </foreach>",
        "    OR <foreach collection=\"tags\" item=\"t\" separator=\" OR \">FIND_IN_SET(#{t}, operation_intent) > 0</foreach>",
        "    OR business_scenario IN ",
        "    <foreach collection=\"tags\" item=\"t\" open=\"(\" separator=\",\" close=\")\">",
        "      #{t}",
        "    </foreach>",
        "  )",
        "</script>"
    })
    List<Long> findIdsByTags(@Param("tags") List<String> tags, @Param("ownerType") int ownerType);
}
