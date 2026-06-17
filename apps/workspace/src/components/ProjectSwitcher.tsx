import { Block, Grid, Row } from '@jsxstyle/react'
import {
  color,
  DropdownMenu,
  fontSize,
  fontWeight,
  spacing,
} from '@repro/design'
import { ChevronDownIcon, FolderIcon, PlusIcon } from 'lucide-react'
import React, { useState } from 'react'
import { useProjectContext } from '~/ProjectContext'
import { CreateProjectDialog } from './CreateProjectDialog'

export interface ProjectSwitcherProps {}

export const ProjectSwitcher: React.FC<ProjectSwitcherProps> = () => {
  const { projects, selectedProject, loading, selectProject } =
    useProjectContext()

  const [menuOpen, setMenuOpen] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  if (loading) {
    return null
  }

  if (!selectedProject) {
    return (
      <>
        <Grid
          padding={spacing.sm}
          color={color.text.secondary}
          fontSize={fontSize.sm}
          fontWeight={fontWeight.normal}
          hoverBackgroundColor={color.bg.hover}
        >
          <Grid
            gridTemplateColumns="auto 1fr"
            inlineSize="100%"
            component="button"
            type="button"
            alignItems="center"
            gap={spacing.md}
            padding={spacing.lg}
            borderRadius={4}
            cursor="pointer"
            border="none"
            background="none"
            color={color.text.secondary}
            fontSize={fontSize.sm}
            fontWeight={fontWeight.normal}
            hoverBackgroundColor={color.bg.muted}
            props={{
              'aria-label': 'Create project',
              onClick: () => setShowCreateDialog(true),
            }}
          >
            <FolderIcon size={14} />
            <Block flexGrow={1} textAlign="left">
              Create project
            </Block>
          </Grid>
        </Grid>

        <CreateProjectDialog
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
        />
      </>
    )
  }

  return (
    <>
      <Grid
        padding={spacing.sm}
        gridTemplateColumns="5fr 1fr"
        gap={spacing.sm}
        color={color.text.secondary}
        fontSize={fontSize.sm}
        fontWeight={fontWeight.normal}
        hoverBackgroundColor={color.bg.hover}
      >
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenu.Trigger fullWidth>
            <Grid
              gridTemplateColumns="auto 1fr auto"
              inlineSize="100%"
              component="button"
              type="button"
              alignItems="center"
              gap={spacing.md}
              padding={spacing.lg}
              borderRadius={4}
              cursor="pointer"
              border="none"
              background="none"
              color={color.text.secondary}
              fontSize={fontSize.sm}
              fontWeight={fontWeight.normal}
              hoverBackgroundColor={color.bg.muted}
              props={{
                'aria-label': `Switch project. Current: ${selectedProject.name}`,
              }}
            >
              <FolderIcon size={14} />
              <Block
                flexGrow={1}
                textAlign="left"
                whiteSpace="nowrap"
                textOverflow="ellipsis"
                overflow="hidden"
              >
                {selectedProject.name}
              </Block>
              <ChevronDownIcon size={12} color={color.text.muted} />
            </Grid>
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
          hoverBackgroundColor={color.bg.muted}
          props={{
            'aria-label': 'Create project',
            onClick: () => setShowCreateDialog(true),
          }}
        >
          <PlusIcon size={14} />
        </Row>
      </Grid>

      <CreateProjectDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
      />
    </>
  )
}
