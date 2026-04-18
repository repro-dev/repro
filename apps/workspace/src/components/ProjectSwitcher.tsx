import { Block, Row } from '@jsxstyle/react'
import { Button, color, DropdownMenu, spacing } from '@repro/design'
import { getProjectMembers as defaultGetProjectMembers } from '@repro/workspace-api'
import {
  ChevronDownIcon,
  FolderIcon,
  PlusIcon,
  SettingsIcon,
} from 'lucide-react'
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjectContext } from '~/ProjectContext'
import { CreateProjectDialog } from './CreateProjectDialog'
import { useProjectSettingsAccess } from './ProjectSettingsNavItem'

export interface ProjectSwitcherProps {
  getMembers?: typeof defaultGetProjectMembers
}

export const ProjectSwitcher: React.FC<ProjectSwitcherProps> = ({
  getMembers = defaultGetProjectMembers,
}) => {
  const { projects, selectedProject, loading, selectProject } =
    useProjectContext()
  const navigate = useNavigate()
  const { href: projectSettingsHref, loading: projectSettingsLoading } =
    useProjectSettingsAccess({ getMembers })

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
          justifyContent="flex-end"
          fontSize={13}
        >
          <Row
            component="button"
            type="button"
            background="none"
            border="none"
            padding={spacing.xs}
            borderRadius={4}
            cursor="pointer"
            color={color.text.muted}
            hoverColor={color.text.secondary}
            hoverBackgroundColor={color.bg.hover}
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
          <Row gap={spacing.xs} alignItems="center">
            {projectSettingsHref && !projectSettingsLoading ? (
              <Row
                component="button"
                type="button"
                alignItems="center"
                justifyContent="center"
                background="none"
                border="none"
                cursor="pointer"
                color={color.text.muted}
                padding={spacing.xs}
                borderRadius={4}
                hoverColor={color.text.secondary}
                hoverBackgroundColor={color.bg.hover}
                props={{
                  'aria-label': 'Project settings',
                  onClick: () => navigate(projectSettingsHref),
                }}
              >
                <SettingsIcon size={14} />
              </Row>
            ) : null}

            <Row
              component="button"
              type="button"
              alignItems="center"
              justifyContent="center"
              background="none"
              border="none"
              cursor="pointer"
              color={color.text.muted}
              padding={spacing.xs}
              borderRadius={4}
              hoverColor={color.text.secondary}
              hoverBackgroundColor={color.bg.hover}
              props={{
                'aria-label': 'Create project',
                onClick: () => setShowCreateDialog(true),
              }}
            >
              <PlusIcon size={14} />
            </Row>
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
      <Row
        alignItems="center"
        gap={spacing.sm}
        padding={spacing.lg}
        color={color.text.secondary}
        fontSize={13}
        fontWeight={500}
      >
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenu.Trigger>
            <Row
              component="button"
              type="button"
              alignItems="center"
              gap={spacing.sm}
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

        <Row gap={spacing.xs} marginLeft="auto" alignItems="center">
          {projectSettingsHref && !projectSettingsLoading ? (
            <Row
              component="button"
              type="button"
              alignItems="center"
              justifyContent="center"
              background="none"
              border="none"
              cursor="pointer"
              color={color.text.muted}
              padding={spacing.xs}
              borderRadius={4}
              hoverColor={color.text.secondary}
              hoverBackgroundColor={color.bg.hover}
              props={{
                'aria-label': 'Project settings',
                onClick: () => navigate(projectSettingsHref),
              }}
            >
              <SettingsIcon size={14} />
            </Row>
          ) : null}

          <Row
            component="button"
            type="button"
            alignItems="center"
            justifyContent="center"
            background="none"
            border="none"
            cursor="pointer"
            color={color.text.muted}
            padding={spacing.xs}
            borderRadius={4}
            hoverColor={color.text.secondary}
            hoverBackgroundColor={color.bg.hover}
            props={{
              'aria-label': 'Create project',
              onClick: () => setShowCreateDialog(true),
            }}
          >
            <PlusIcon size={14} />
          </Row>
        </Row>
      </Row>

      <CreateProjectDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
      />
    </>
  )
}
