import { Block, Row } from '@jsxstyle/react'
import { color, DropdownMenu, spacing } from '@repro/design'
import { ChevronDownIcon, FolderIcon } from 'lucide-react'
import React from 'react'
import { useProjectContext } from '~/ProjectContext'

export const ProjectSwitcher: React.FC = () => {
  const { projects, selectedProject, loading, selectProject } =
    useProjectContext()

  if (loading) {
    return null
  }

  if (projects.length === 0) {
    return (
      <Row
        alignItems="center"
        gap={spacing.sm}
        padding={spacing.lg}
        color={color.text.muted}
        fontSize={13}
      >
        <FolderIcon size={14} />
        <Block>No projects</Block>
      </Row>
    )
  }

  // Single project: show the name but no switcher dropdown.
  if (projects.length === 1 || !selectedProject) {
    return (
      <Row
        alignItems="center"
        gap={spacing.sm}
        padding={spacing.lg}
        color={color.text.secondary}
        fontSize={13}
        fontWeight={500}
      >
        <FolderIcon size={14} />
        <Block>{selectedProject?.name ?? projects[0]?.name}</Block>
      </Row>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger fullWidth>
        <Row
          component="button"
          type="button"
          width="100%"
          alignItems="center"
          gap={spacing.sm}
          padding={spacing.lg}
          cursor="pointer"
          border="none"
          background="none"
          color={color.text.secondary}
          fontSize={13}
          fontWeight={500}
          hoverBackgroundColor={color.bg.hover}
          props={{
            'aria-label': `Switch project. Current: ${selectedProject.name}`,
          }}
        >
          <FolderIcon size={14} />
          <Block flexGrow={1} textAlign="left">
            {selectedProject.name}
          </Block>
          <ChevronDownIcon size={12} color={color.text.muted} />
        </Row>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content side="bottom" align="start">
        {projects.map(project => (
          <DropdownMenu.Item
            key={project.id}
            onSelect={() => selectProject(project.id)}
          >
            {project.name}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
