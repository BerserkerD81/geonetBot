"use client";

import { GripVertical } from "lucide-react";
import { cn } from "./utils";
import {
  PanelGroup as PanelGroupBase,
  Panel as PanelBase,
  PanelResizeHandle as PanelResizeHandleBase,
} from "react-resizable-panels";
import type { PanelGroupProps, PanelProps, PanelResizeHandleProps } from "react-resizable-panels";

function ResizablePanelGroup({
  className,
  ...props
}: PanelGroupProps) {
  return (
    <PanelGroupBase
      direction={"horizontal"} data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
        className
      )}
      {...props}    />
  );
}

function ResizablePanel(props: PanelProps) {
  return <PanelBase data-slot="resizable-panel" {...props} />;
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: PanelResizeHandleProps & { withHandle?: boolean }) {
  return (
    <PanelResizeHandleBase
      data-slot="resizable-handle"
      className={cn(
        "bg-border relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border">
          <GripVertical className="size-2.5" />
        </div>
      )}
    </PanelResizeHandleBase>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
