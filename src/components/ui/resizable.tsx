"use client";

import * as React from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";

import { cn } from "@/lib/utils";

type ResizableContextValue = {
  direction: "horizontal" | "vertical";
};

const ResizableContext = React.createContext<ResizableContextValue>({
  direction: "horizontal",
});

type ResizableProps = React.ComponentProps<typeof PanelGroup> & {
  direction: "horizontal" | "vertical";
};

const Resizable = ({ className, direction, ...props }: ResizableProps) => (
  <ResizableContext.Provider value={{ direction }}>
    <PanelGroup
      direction={direction}
      className={cn(
        "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
        className,
      )}
      {...props}
    />
  </ResizableContext.Provider>
);

const ResizablePanel = Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof PanelResizeHandle> & {
  withHandle?: boolean;
}) => (
  <PanelResizeHandle
    className={cn(
      "relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90",
      className,
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
        <div className="h-2 w-px rounded-sm bg-zinc-950 dark:bg-zinc-300" />
      </div>
    )}
  </PanelResizeHandle>
);

export { Resizable, ResizablePanel, ResizableHandle };
