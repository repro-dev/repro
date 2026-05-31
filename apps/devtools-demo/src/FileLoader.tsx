import { Col } from '@jsxstyle/react'
import { Button, Card, Text, color, radius, spacing } from '@repro/design'
import React, { useRef, useState } from 'react'

interface Props {
  onLoad(file: File): void
}

export const FileLoader: React.FC<Props> = ({ onLoad }) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  function handleChange(evt: React.ChangeEvent<HTMLInputElement>) {
    const file = evt.currentTarget.files?.item(0)

    if (file) {
      onLoad(file)
    }
  }

  function handleBrowseClick() {
    fileInputRef.current?.click()
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)

    const file = e.dataTransfer.files[0]

    if (file && file.name.endsWith('.repro')) {
      onLoad(file)
    }
  }

  return (
    <Card height="100%" fullBleed padding={0}>
      <Col
        alignItems="center"
        justifyContent="center"
        height="100%"
        gap={spacing.lg}
        padding={spacing['3xl']}
        border={`2px dashed ${
          isDragOver ? color.primary : color.border.default
        }`}
        borderRadius={radius.md}
        backgroundColor={isDragOver ? color.bg.hover : color.bg.surface}
        cursor="pointer"
        props={{
          onDragOver: handleDragOver,
          onDragLeave: handleDragLeave,
          onDrop: handleDrop,
          onClick: handleBrowseClick,
        }}
      >
        <Text variant="body">Drop your .repro file here</Text>

        <Button variant="outlined" size="small">
          Browse files
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".repro"
          style={{ display: 'none' }}
          onChange={handleChange}
        />
      </Col>
    </Card>
  )
}
