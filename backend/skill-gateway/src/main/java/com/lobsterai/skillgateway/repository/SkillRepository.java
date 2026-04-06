package com.lobsterai.skillgateway.repository;

import com.lobsterai.skillgateway.entity.Skill;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SkillRepository extends JpaRepository<Skill, Long> {
    Optional<Skill> findByName(String name);

    @Query("SELECT new com.lobsterai.skillgateway.entity.Skill(s.id, s.name, s.description, s.type, s.executionMode, s.enabled, s.requiresConfirmation, s.createdAt, s.updatedAt) FROM Skill s")
    List<Skill> findAllSummary();
}
