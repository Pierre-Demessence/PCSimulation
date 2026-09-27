import { Window, WindowLayer } from '@pierre/winkit';
import { render } from 'preact';

import { useEffect, useRef } from 'preact/hooks';

/**
 * Adopts an existing DOM node into the Preact tree. The control panel is built
 * with plain DOM, so rather than rewrite it as components, each window simply
 * takes ownership of the node it was handed and returns it on unmount.
 */
function Adopt({ node }: { readonly node: HTMLElement }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (element === null)
      return;
    element.append(node);
    return () => node.remove();
  }, [node]);
  return <div ref={host} class="wk-adopt" />;
}

interface MachineWindowsProps {
  readonly picture: HTMLElement;
  readonly readouts: HTMLElement;
}

function MachineWindows({ picture, readouts }: MachineWindowsProps) {
  return (
    <WindowLayer>
      <Window
        title="Controls"
        open
        defaultPosition={{ x: 16, y: 16 }}
        defaultSize={{ h: 560, w: 304 }}
        minSize={{ h: 200, w: 244 }}
        persistKey="pcsim.window.controls"
      >
        <Adopt node={picture} />
        {/* Where the build controls wait while the picture is the face on
            screen; the sheet takes them when it has the reader instead. */}
        <div id="controls-dock" class="window-dock" />
      </Window>
      <Window
        title="Readouts"
        open
        defaultPosition={{ x: 336, y: 16 }}
        defaultSize={{ h: 440, w: 336 }}
        minSize={{ h: 160, w: 220 }}
        persistKey="pcsim.window.readouts"
      >
        <Adopt node={readouts} />
      </Window>
    </WindowLayer>
  );
}

/** Mounts the floating Controls and Readouts windows over the canvas. */
export function mountWindows(root: HTMLElement, picture: HTMLElement, readouts: HTMLElement): void {
  render(<MachineWindows picture={picture} readouts={readouts} />, root);
}
