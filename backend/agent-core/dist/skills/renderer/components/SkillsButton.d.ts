import React from 'react';
import { Skill } from '../../shared/types';
interface SkillsButtonProps {
    onSelectSkill: (skill: Skill) => void;
    onManageSkills: () => void;
    className?: string;
}
declare const SkillsButton: React.FC<SkillsButtonProps>;
export default SkillsButton;
