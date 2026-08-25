import { ContainerForm } from '../components/ContainerForm';
import { useUIStore } from '../store/uiStore';
import { shortImage } from '../utils/format';
import type { Route } from '../types';

/**
 * The form that makes a container, as a page of its own.
 *
 * It was a dialog, and it was the one form here too long to be one: name,
 * image, limits, networks, ports, mounts and a whole environment scrolling
 * inside a panel that covered the list the container was about to appear in.
 * As a page it gets the window's height, and leaving it is the back link every
 * other page is left by.
 *
 * The page itself holds nothing. What to open with and where to go back to
 * both travel on the route, because there is more than one way in -- the
 * button on the container list, a template from the gallery, an image run from
 * its own page -- and each of them should be what leaving returns to.
 */
export function ContainerCreatePage({
  route,
}: {
  route: Extract<Route, { name: 'container-new' }>;
}) {
  const back = useUIStore((s) => s.back);
  const openTask = useUIStore((s) => s.openTask);

  return (
    <ContainerForm
      backTo={cameFrom(route.from)}
      initial={route.initial}
      // A create is a pull, an unpack and a start -- minutes of it, the first
      // time an image is used -- so pressing the button lands on the output
      // rather than on a list with a bar in the corner. Back from there skips
      // this form: it has been submitted, and an empty one offering to do it
      // again is not where anybody wants to land.
      onStarted={openTask}
      onClose={back}
    />
  );
}

/** What to call the page this was opened from, on the link back to it. */
function cameFrom(from: Route | undefined): string {
  if (!from) return 'Containers';

  switch (from.name) {
    case 'images':
      return 'Images';
    case 'image':
      return shortImage(from.reference);
    case 'templates':
      return 'Templates';
    default:
      return 'Containers';
  }
}
