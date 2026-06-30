import { Block, Col, Row } from '@jsxstyle/react'
import {
  Button,
  FX,
  Meter,
  color,
  fontSize,
  fontWeight,
  lineHeight,
  spacing,
} from '@repro/design'
import { UploadProgress, UploadStage } from '@repro/recording-api'
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CopyIcon,
  CornerUpLeftIcon,
  LoaderIcon,
} from 'lucide-react'
import React, { Fragment } from 'react'

interface Props {
  progress?: UploadProgress | null
  error?: Error | null
  projectId: string | null
  onClose?: () => void
}

const Label: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  return (
    <Block
      marginBottom={spacing.md}
      fontSize={fontSize.sm}
      lineHeight={lineHeight.tight}
    >
      {children}
    </Block>
  )
}

const List: React.FC<React.PropsWithChildren<{}>> = ({ children }) => (
  <Col gap={spacing.xl}>{children}</Col>
)

const ListItem: React.FC<React.PropsWithChildren<{}>> = ({ children }) => (
  <Block>{children}</Block>
)

function computeOverallProgress(stages: Record<UploadStage, number>): number {
  const values = Object.values(stages)
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

export const ProgressOverlay: React.FC<Props> = ({
  progress,
  error,
  projectId,
  onClose,
}) => {
  // Determine the effective error: prefer the explicit `error` prop, then progress.error
  const effectiveError = error ?? progress?.error ?? null

  const recordingUrl =
    projectId && progress?.recordingId
      ? `${process.env.REPRO_APP_URL}/projects/${projectId}/recordings/${progress.recordingId}`
      : null

  function copyToClipboard() {
    if (recordingUrl) {
      navigator.clipboard.writeText(recordingUrl)
    }
  }

  const isIndeterminate = !progress && !effectiveError

  return (
    <>
      {/* Error state — from either prop or progress.error */}
      {effectiveError && (
        <Col gap={spacing.lg}>
          <Row alignItems="center" gap={spacing.lg}>
            <AlertTriangleIcon size={32} color={color.danger} />
            <Block>
              <Block
                fontSize={fontSize.xs}
                fontWeight={fontWeight.bold}
                color={color.danger}
                textTransform="uppercase"
              >
                Could not create recording
              </Block>

              <Row
                gap={spacing.sm}
                alignItems="center"
                fontSize={fontSize.md}
                marginTop={spacing.lg}
              >
                {effectiveError.message}
              </Row>
            </Block>
          </Row>
          <Block alignSelf="center">
            <Button variant="text" onClick={onClose}>
              <CornerUpLeftIcon size={16} /> Return To Page
            </Button>
          </Block>
        </Col>
      )}

      {/* Completed state */}
      {progress?.completed && !effectiveError && (
        <Col gap={spacing.lg}>
          <Row alignItems="center" gap={spacing.lg}>
            <CheckCircle2Icon size={32} color={color.success} />
            <Block
              fontSize={fontSize.xs}
              fontWeight={fontWeight.bold}
              color={color.text.default}
              textTransform="uppercase"
            >
              Recording Created
            </Block>
          </Row>
          <Row gap={spacing.md} justifyContent="center">
            {recordingUrl && (
              <Button
                variant="contained"
                size="small"
                onClick={() => window.open(recordingUrl, '_blank')}
              >
                Open in Repro
              </Button>
            )}
            <Button
              variant="outlined"
              context="info"
              size="small"
              disabled={!recordingUrl}
              onClick={copyToClipboard}
            >
              <CopyIcon size={18} />
            </Button>
          </Row>
          <Block alignSelf="center">
            <Button variant="text" onClick={onClose}>
              <CornerUpLeftIcon size={16} /> Return To Page
            </Button>
          </Block>
        </Col>
      )}

      {/* Indeterminate state — preparing upload */}
      {isIndeterminate && (
        <Col gap={spacing.lg} alignItems="center">
          <FX.Spin>
            <LoaderIcon size={24} />
          </FX.Spin>
          <Block
            fontSize={fontSize.xs}
            fontWeight={fontWeight.bold}
            color={color.text.default}
            textTransform="uppercase"
          >
            Preparing upload...
          </Block>
        </Col>
      )}

      {/* In-progress state */}
      {progress && !progress.completed && !effectiveError && (
        <Fragment>
          <Block
            fontSize={fontSize.xs}
            fontWeight={fontWeight.bold}
            color={color.text.default}
            textTransform="uppercase"
          >
            Uploading Recording
          </Block>

          <Block marginTop={spacing.xl}>
            <List>
              {/* Overall progress bar */}
              <ListItem>
                <Label>Overall progress</Label>
                <Meter
                  min={0}
                  max={1}
                  value={computeOverallProgress(progress.stages)}
                />
              </ListItem>

              <ListItem>
                <Label>Saving recording details</Label>
                <Meter
                  min={0}
                  max={1}
                  value={progress.stages[UploadStage.CreateRecording]}
                />
              </ListItem>

              <ListItem>
                <Label>Saving events</Label>
                <Meter
                  min={0}
                  max={1}
                  value={progress.stages[UploadStage.SaveEvents]}
                />
              </ListItem>

              <ListItem>
                <Label>Reading resources</Label>
                <Meter
                  min={0}
                  max={1}
                  value={progress.stages[UploadStage.ReadResources]}
                />
              </ListItem>

              <ListItem>
                <Label>Uploading resources</Label>
                <Meter
                  min={0}
                  max={1}
                  value={progress.stages[UploadStage.SaveResources]}
                />
              </ListItem>
            </List>
          </Block>
        </Fragment>
      )}
    </>
  )
}
