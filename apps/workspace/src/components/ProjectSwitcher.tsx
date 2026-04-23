import { Block, Row } from '@jsxstyle/react'
import { Button, color, DropdownMenu, spacing, textStyles } from '@repro/design'
import { getProjectMembers as defaultGetProjectMembers } from '@repro/workspace-api'
import {
  ChevronDownIcon,
  FolderIcon,
  PlusIcon,
  SettingsIcon,
} from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
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
  const projectSettingsHrefRef = useRef<string | null>(null)

  useEffect(() => {
    if (projectSettingsHref) {
      projectSettingsHrefRef.current = projectSettingsHref
    }
  }, [projectSettingsHref])

  const projectSettingsActionHref =
    projectSettingsHref ??
    (projectSettingsLoading ? projectSettingsHrefRef.current : null)

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
        >
          <Button
            variant="text"
            context="neutral"
            size="medium"
            onClick={() => setShowCreateDialog(true)}
          >
            <PlusIcon size={14} />
            <Block {...textStyles.label}>Create project</Block>
          </Button>
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
        <Row alignItems="center" gap={spacing.sm} padding={spacing.lg}>
          <FolderIcon size={14} />
          <Block {...textStyles.label} color={color.text.default} flexGrow={1}>
            {selectedProject?.name ?? projects[0]?.name}
          </Block>
          <Row gap={spacing.xs} alignItems="center">
            {projectSettingsActionHref ? (
              <Button
                variant="text"
                context="neutral"
                size="medium"
                disabled={projectSettingsLoading}
                onClick={() => navigate(projectSettingsActionHref)}
              >
                <SettingsIcon size={14} />
                <Block {...textStyles.label}>Project settings</Block>
              </Button>
            ) : null}

            <Button
              variant="text"
              context="neutral"
              size="medium"
              onClick={() => setShowCreateDialog(true)}
            >
              <PlusIcon size={14} />
              <Block {...textStyles.label}>Create project</Block>
            </Button>
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
      <Row alignItems="center" gap={spacing.sm} padding={spacing.lg}>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenu.Trigger>
            <Button variant="outlined" context="neutral" size="medium">
              <FolderIcon size={14} />
              <Block {...textStyles.label}>{selectedProject.name}</Block>
              <ChevronDownIcon size={12} color={color.text.muted} />
            </Button>
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
          {projectSettingsActionHref ? (
            <Button
              variant="text"
              context="neutral"
              size="medium"
              disabled={projectSettingsLoading}
              onClick={() => navigate(projectSettingsActionHref)}
            >
              <SettingsIcon size={14} />
              <Block {...textStyles.label}>Project settings</Block>
            </Button>
          ) : null}

          <Button
            variant="text"
            context="neutral"
            size="medium"
            onClick={() => setShowCreateDialog(true)}
          >
            <PlusIcon size={14} />
            <Block {...textStyles.label}>Create project</Block>
          </Button>
        </Row>
      </Row>

      <CreateProjectDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
      />
    </>
  )
}
