import React from 'react';
import { Skill } from '../../shared/types';
interface SkillsPopoverProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectSkill: (skill: Skill) => void;
    onManageSkills: () => void;
    anchorRef: React.RefObject<HTMLElement>;
}
declare const SkillsPopover: React.FC<SkillsPopoverProps>;
export default SkillsPopover;
