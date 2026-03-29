import React from 'react';
interface SkillsViewProps {
    isSidebarCollapsed?: boolean;
    onToggleSidebar?: () => void;
    onNewChat?: () => void;
    updateBadge?: React.ReactNode;
}
declare const SkillsView: React.FC<SkillsViewProps>;
export default SkillsView;
