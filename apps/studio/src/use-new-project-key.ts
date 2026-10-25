/**
 * New project from the keyboard on the start page: the desktop menu item (`bezier:new-project`,
 * which owns Cmd+N there) and the key itself where the browser allows. Inactive inside a project.
 */

import { useEffect, useRef } from 'react';

export function useNewProjectKey(onNew: () => void): void {
  const create = useRef(onNew);
  create.current = onNew;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'n' || !(event.metaKey || event.ctrlKey)) return;
      if (event.shiftKey || event.altKey) return;
      event.preventDefault();
      create.current();
    };
    const onMenu = () => create.current();
    window.addEventListener('keydown', onKey);
    window.addEventListener('bezier:new-project', onMenu);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('bezier:new-project', onMenu);
    };
  }, []);
}
