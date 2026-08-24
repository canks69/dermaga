import { ContainerForm } from '../components/ContainerForm';
import { api } from '../services/api';
import { useResourceStore } from '../store/resourceStore';
import { useUIStore } from '../store/uiStore';
import type { Route } from '../types';

/**
 * The container form again, over a container that already exists.
 *
 * A page for the same reason creating is one: it is the same thirty fields,
 * and as a panel over the container's own page it covered the thing it was
 * about. The tab underneath is not lost by leaving it -- the route this was
 * opened from is carried, tab and all, so going back lands where the pencil
 * was pressed rather than at the top of the container.
 *
 * What it opens with was read before it was opened: the server's copy of the
 * spec, or an edit that never finished, whichever the detail page found. So
 * this page holds nothing of its own except the container it names.
 */
export function ContainerEditPage({
  route,
}: {
  route: Extract<Route, { name: 'container-edit' }>;
}) {
  const back = useUIStore((s) => s.back);
  const container = useResourceStore((s) => s.containers.find((c) => c.id === route.id));

  return (
    <ContainerForm
      // The container's own name, because that is what the page behind this
      // one is called. Falling back to the id keeps the link honest in the
      // moment between a container going and this page noticing.
      backTo={container?.name ?? route.id}
      editing={route.id}
      initial={route.initial}
      resumed={route.resumed}
      startsWithDermaga={container?.autoBoot}
      onDiscardResumed={() => {
        void api.discardPendingEdit(route.id).catch(() => {
          // Nothing to tell the user: this page is closing either way, and the
          // next edit reads the container itself.
        });
        back();
      }}
      onClose={back}
    />
  );
}
