import { Block, Row } from '@jsxstyle/react'
import { Button, color, DropdownMenu, spacing } from '@repro/design'
import { ChevronDownIcon, FolderIcon, PlusIcon } from 'lucide-react'
import React, { useState } from 'react'
import { useProjectContext } from '~/ProjectContext'
import { CreateProjectDialog } from './CreateProjectDialog'

export const ProjectSwitcher: React.FC = () => {
  const { projects, selectedProject, loading, selectProject } =
    useProjectContext()

  const [menuOpen, setMenuOpen] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  if (loading) {
    return null
  }

  if (projects.length === 0) {
    return (
      <>
        <Row
          alignItems="center"
          gap={spacing.sm}
          padding={spacing.lg}
          color={color.text.muted}
          fontSize={13}
        >
          <FolderIcon size={14} />
          <Block
            component="button"
            type="button"
            background="none"
            border="none"
            padding={0}
            cursor="pointer"
            color={color.text.secondary}
            fontSize={13}
            props={{ onClick: () => setShowCreateDialog(true) }}
          >
            Create project
          </Block>
        </Row>

        <CreateProjectDialog
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
        />
      </>
    )
  }

  // Single project: show the name with a create button.
  if (projects.length === 1 || !selectedProject) {
    return (
      <>
        <Row
          alignItems="center"
          gap={spacing.sm}
          padding={spacing.lg}
          color={color.text.secondary}
          fontSize={13}
          fontWeight={500}
        >
          <FolderIcon size={14} />
          <Block flexGrow={1}>
            {selectedProject?.name ?? projects[0]?.name}
          </Block>
          <Row
            component="button"
            type="button"
            alignItems="center"
            justifyContent="center"
            background="none"
            border="none"
            cursor="pointer"
            color={color.text.muted}
            padding={0}
            hoverColor={color.text.secondary}
            props={{
              'aria-label': 'Create project',
              onClick: () => setShowCreateDialog(true),
            }}
          >
            <PlusIcon size={14} />
          </Row>
        </Row>

        <CreateProjectDialog
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
        />
      </>
    )
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
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
          <DropdownMenu.Separator />
          <Row padding={spacing.xs} justifyContent="flex-start">
            <Button
              variant="outlined"
              context="neutral"
              size="medium"
              rounded
              onClick={() => {
                setMenuOpen(false)
                setShowCreateDialog(true)
              }}
            >
              <PlusIcon size={14} />
              Create project
            </Button>
          </Row>
        </DropdownMenu.Content>
      </DropdownMenu>

      <CreateProjectDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
      />
    </>
  )
}
