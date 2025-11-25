import { CSSProperties } from "@jsxstyle/core";

declare module "@jsxstyle/core" {
  interface PseudoPrefixedProps {
    activeScale?: CSSProperties["scale"];

    focusBorderColor?: CSSProperties["borderColor"];
    focusOutline?: CSSProperties["outline"];

    hoverBackgroundImage?: CSSProperties["backgroundImage"];

    hoverBorderColor?: CSSProperties["borderColor"];
    hoverBorderWidth?: CSSProperties["borderWidth"];

    hoverBorderBottom?: CSSProperties["borderBottom"];
    hoverBorderLeft?: CSSProperties["borderLeft"];
    hoverBorderRight?: CSSProperties["borderRight"];
    hoverBorderTop?: CSSProperties["borderTop"];

    hoverHeight?: CSSProperties["height"];
    hoverWidth?: CSSProperties["width"];

    hoverVisibility?: CSSProperties["visibility"];
    emptyVisibility?: CSSProperties["visibility"];

    emptyDisplay?: CSSProperties["display"];
  }
}
