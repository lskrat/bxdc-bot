package com.lobsterai.skillgateway.service;

import com.lobsterai.skillgateway.entity.Skill;
import com.lobsterai.skillgateway.repository.SkillRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class SkillService {

    private final SkillRepository skillRepository;

    public SkillService(SkillRepository skillRepository) {
        this.skillRepository = skillRepository;
    }

    @PostConstruct
    public void initializeDefaultSkills() {
        ensureDefaultExtendedSkills();
    }

    public List<Skill> getAllSkills() {
        ensureDefaultExtendedSkills();
        return skillRepository.findAll();
    }

    public Optional<Skill> getSkillById(Long id) {
        return skillRepository.findById(id);
    }

    public Optional<Skill> getSkillByName(String name) {
        return skillRepository.findByName(name);
    }

    public Skill createSkill(Skill skill) {
        if (skillRepository.findByName(skill.getName()).isPresent()) {
            throw new IllegalArgumentException("Skill with name " + skill.getName() + " already exists");
        }
        return skillRepository.save(skill);
    }

    public Skill updateSkill(Long id, Skill skillDetails) {
        Skill skill = skillRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Skill not found for this id :: " + id));

        skill.setName(skillDetails.getName());
        skill.setDescription(skillDetails.getDescription());
        skill.setType(skillDetails.getType());
        skill.setConfiguration(skillDetails.getConfiguration());
        skill.setEnabled(skillDetails.isEnabled());

        return skillRepository.save(skill);
    }

    public void deleteSkill(Long id) {
        Skill skill = skillRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Skill not found for this id :: " + id));
        skillRepository.delete(skill);
    }

    private void ensureDefaultExtendedSkills() {
        if (skillRepository.findByName("获取时间").isPresent()) {
            return;
        }

        Skill getTimeSkill = new Skill();
        getTimeSkill.setName("获取时间");
        getTimeSkill.setDescription("获取当前系统时间，便于 Agent 在回答时间相关问题时使用。");
        getTimeSkill.setType("EXTENSION");
        getTimeSkill.setConfiguration("{\"kind\":\"time\",\"operation\":\"now\"}");
        getTimeSkill.setEnabled(true);
        skillRepository.save(getTimeSkill);
    }
}
