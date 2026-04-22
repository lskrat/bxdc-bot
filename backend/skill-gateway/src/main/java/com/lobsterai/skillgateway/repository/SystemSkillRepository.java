package com.lobsterai.skillgateway.repository;

import com.lobsterai.skillgateway.entity.SystemSkill;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SystemSkillRepository extends JpaRepository<SystemSkill, Long> {

    Optional<SystemSkill> findByToolNameAndEnabledIsTrue(String toolName);

    List<SystemSkill> findByEnabledIsTrueOrderByToolNameAsc();
}
