package com.lobsterai.skillgateway.repository;

import com.lobsterai.skillgateway.entity.Skill;
import com.lobsterai.skillgateway.entity.SkillVisibility;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SkillRepository extends JpaRepository<Skill, Long> {
    Optional<Skill> findByName(String name);

    @Query("SELECT new com.lobsterai.skillgateway.entity.Skill(s.id, s.name, s.description, s.type, s.executionMode, s.enabled, s.requiresConfirmation, s.visibility, s.avatar, s.createdBy, s.createdAt, s.updatedAt) FROM Skill s WHERE s.visibility = :publicVis")
    List<Skill> findAllPublicSummary(@Param("publicVis") SkillVisibility publicVis);

    @Query("SELECT new com.lobsterai.skillgateway.entity.Skill(s.id, s.name, s.description, s.type, s.executionMode, s.enabled, s.requiresConfirmation, s.visibility, s.avatar, s.createdBy, s.createdAt, s.updatedAt) FROM Skill s WHERE s.visibility = :publicVis OR (s.visibility = :privateVis AND s.createdBy = :userId)")
    List<Skill> findVisibleSummaryForUser(
            @Param("publicVis") SkillVisibility publicVis,
            @Param("privateVis") SkillVisibility privateVis,
            @Param("userId") String userId
    );
}
