import { create } from 'zustand';
import type {
  BuildDrop,
  ContainerSpec,
  ContainerTab,
  MachineTab,
  PendingEdit,
  Route,
  TunnelRoute,
} from '../types';

/**
 * Something to do on arrival, set by whoever navigated. The command palette can
 * then mean "pull an image" rather than "go to Images and find the button",
 * without reaching into another page's state.
 */
export type Intent =
  | 'image.pull'
  | 'volume.create'
  | 'network.create'
  | 'network.attach'
  | 'network.detach'
  | 'registry.add';

/**
 * What an intent is about: the container to detach, and nothing more elaborate.
 *
 * It used to be able to carry a whole value as well -- a Dockerfile dropped on
 * the window, which is a folder, a filename within it and a tag worth
 * suggesting. That one is a route of its own now, where those three things can
 * be three things rather than something to parse back out.
 */
export type IntentTarget = string;

interface UIState {
  route: Route;
  /**
   * A move that was stopped on the way out, waiting on an answer. Null when
   * nothing is being asked.
   */
  held: Partial<UIState> | null;
  /** Leave anyway, and lose whatever was in the way. */
  goAnyway: () => void;
  /** Stay, and put the question away. */
  stay: () => void;
  /**
   * What is typed into the title bar. There is one search in this app and this
   * is it: every page used to carry a box of its own as well, so a name typed
   * in one of them found nothing while the other had the answer.
   */
  globalQuery: string;
  intent: Intent | null;
  /** What the intent is about, when it needs one -- the container to detach. */
  intentTarget: IntentTarget | null;
  navigate: (route: Route) => void;
  /** Navigates and asks the page it lands on to open something. */
  navigateWith: (route: Route, intent: Intent, target?: IntentTarget) => void;
  /** Called by the page once it has acted on the intent, or dismissed it. */
  clearIntent: () => void;
  /**
   * Opens the form that makes a container, remembering where it was opened
   * from so leaving it goes back there -- the image's page, if that is what
   * asked for it, rather than always the container list.
   */
  newContainer: (initial?: Partial<ContainerSpec>) => void;
  /**
   * Opens that same form over a container that already exists, on the spec
   * whoever is opening it has already read.
   */
  editContainer: (id: string, initial: ContainerSpec, resumed?: PendingEdit) => void;
  /** Opens the template catalogue, which is a page on the way to that form. */
  browseTemplates: () => void;
  /**
   * Opens the build form: on one half or the other, or on what a dropped
   * Dockerfile has already answered.
   */
  buildImage: (opening?: { start?: 'folder' | 'paste'; drop?: BuildDrop }) => void;
  /** Opens what a run is printing, by the window's own name for it. */
  openTask: (id: string) => void;
  /**
   * Opens the form that publishes a hostname. With a route, it is that route
   * being moved -- the same form, naming what it replaces.
   */
  addRoute: (editing?: TunnelRoute) => void;
  /** Opens the form that makes a machine. */
  newMachine: () => void;
  /** `path` opens the files tab at a directory, e.g. a volume's mount point. */
  openContainer: (id: string, tab?: ContainerTab, path?: string) => void;
  openMachine: (id: string, tab?: MachineTab) => void;
  openImage: (reference: string) => void;
  openNetwork: (name: string) => void;
  openVolume: (name: string) => void;
  /** Switches tabs within the current detail route; ignored elsewhere. */
  setTab: (tab: string) => void;
  back: () => void;
  setGlobalQuery: (query: string) => void;
}

/** What every way of moving lets go of on the way. */
const clearedOnMove = { intent: null, intentTarget: null, globalQuery: '' } as const;

/**
 * Whatever is standing on the current page and would lose something if it were
 * left. In practice a form somebody has typed into.
 *
 * Held here rather than in the store because it is not state: nothing renders
 * differently for it, and a page registering itself as state would be a render
 * writing to a store during one.
 */
let asking: (() => boolean) | null = null;

/**
 * Says that leaving this page costs something, so ask first.
 *
 * Called by a page with unsaved work in it, and called again with null when
 * that page goes -- which every form does through an effect's cleanup, so a
 * page that has already gone can never hold the window hostage.
 *
 * The reason this exists at all: a form is a page now, which means the sidebar
 * is beside it the whole time it is being filled in. Escape was deliberately
 * left out of these forms so that a stray key could not throw away ten minutes
 * of typing -- and a stray click on the sidebar did exactly that instead.
 */
export function askBeforeLeaving(ask: (() => boolean) | null): void {
  asking = ask;
}

/**
 * Where a page opened from another page should go back to.
 *
 * Normally the page it was opened from. Not for a form, though: a build that
 * has been started is not something to press back into -- the form there would
 * be an empty one offering to do it again -- so a route that carries its own
 * way out hands that over instead of becoming one.
 */
function behind(route: Route): Route | undefined {
  switch (route.name) {
    case 'task':
    case 'image-build':
    case 'tunnel-route':
    case 'container-new':
    case 'container-edit':
    case 'machine-new':
      return route.from;
    default:
      return route;
  }
}

/**
 * Every way of leaving a page passes through here.
 *
 * Where something has asked to be asked first, the move is not made: it is put
 * down as `held`, the window puts the question, and the answer either lets it
 * through or throws it away. One place rather than thirteen, because the ways
 * of moving are only going to go on multiplying and a guard that covers twelve
 * of them is a guard somebody will find the thirteenth of by losing a form.
 */
function move(next: (state: UIState) => Partial<UIState>) {
  return (state: UIState): Partial<UIState> => {
    const wanted = next(state);

    if (wanted.route && wanted.route !== state.route && asking?.()) {
      return { held: wanted };
    }

    return wanted;
  };
}

export const useUIStore = create<UIState>((set) => ({
  route: { name: 'containers' },
  held: null,
  // Straight through, without asking again: the question has been answered.
  goAnyway: () => set((state) => ({ ...state.held, held: null })),
  stay: () => set({ held: null }),
  globalQuery: '',
  intent: null,
  intentTarget: null,
  // Moving clears the search: the page you asked for is the page you land on.
  // Every other way of moving drops a pending intent too -- arriving somewhere
  // by another route means the user changed their mind.
  navigate: (route) => set(move(() => ({ route, ...clearedOnMove }))),
  // Navigates and asks the page it lands on to open something, which is how a
  // search result can be "Pull an image" rather than "go to Images and find
  // the button".
  navigateWith: (route, intent, target) =>
    set(move(() => ({ route, intent, intentTarget: target ?? null, globalQuery: '' }))),
  clearIntent: () => set({ intent: null, intentTarget: null }),
  newContainer: (initial) =>
    set(move((state) => ({
      // The page it was opened from, not the one before that: a create opened
      // from another create cannot happen, and anything else is one step back.
      route: { name: 'container-new', initial, from: state.route },
      ...clearedOnMove,
    }))),
  editContainer: (id, initial, resumed) =>
    set(
      move((state) => ({
        route: { name: 'container-edit', id, initial, resumed, from: state.route },
        ...clearedOnMove,
      }))
    ),
  browseTemplates: () =>
    set(move((state) => ({ route: { name: 'templates', from: state.route }, ...clearedOnMove }))),
  buildImage: (opening) =>
    set(
      move((state) => ({
        route: {
        name: 'image-build',
        start: opening?.start,
        drop: opening?.drop,
        // A second Dockerfile dropped while this page is open must not make
        // the page its own way back: keep the one it already had.
          from: state.route.name === 'image-build' ? state.route.from : state.route,
        },
        ...clearedOnMove,
      }))
    ),
  openTask: (id) =>
    set(
      move((state) => ({ route: { name: 'task', id, from: behind(state.route) }, ...clearedOnMove }))
    ),
  addRoute: (editing) =>
    set(
      move((state) => ({
        route: { name: 'tunnel-route', editing, from: behind(state.route) },
        ...clearedOnMove,
      }))
    ),
  newMachine: () =>
    set(
      move((state) => ({ route: { name: 'machine-new', from: behind(state.route) }, ...clearedOnMove }))
    ),
  // Logs, not Inspect. A container is opened to see what it is saying far more
  // often than to read back the flags it was started with, and the flags are
  // one tab away either way.
  openContainer: (id, tab = 'logs', path) =>
    set(move(() => ({ route: { name: 'container', id, tab, path }, globalQuery: '' }))),
  openMachine: (id, tab = 'overview') =>
    set(move(() => ({ route: { name: 'machine', id, tab }, ...clearedOnMove }))),
  openImage: (reference) =>
    set(move(() => ({ route: { name: 'image', reference }, ...clearedOnMove }))),
  openNetwork: (name) =>
    set(move(() => ({ route: { name: 'network', network: name }, globalQuery: '' }))),
  openVolume: (name) =>
    set(move(() => ({ route: { name: 'volume', volume: name }, globalQuery: '' }))),
  setTab: (tab) =>
    set((state) => {
      if (state.route.name === 'container') {
        return { route: { ...state.route, tab: tab as ContainerTab } };
      }
      if (state.route.name === 'machine') {
        return { route: { ...state.route, tab: tab as MachineTab } };
      }
      return state;
    }),
  back: () =>
    set(
      move((state) => {
        const cleared = { intent: null, intentTarget: null, globalQuery: '' };
        if (state.route.name === 'machine-new') {
          return { route: state.route.from ?? { name: 'machines' }, ...cleared };
        }
        if (state.route.name === 'tunnel-route') {
          return { route: state.route.from ?? { name: 'tunnels' }, ...cleared };
        }
        if (state.route.name === 'task') {
          return { route: state.route.from ?? { name: 'images' }, ...cleared };
        }
        if (state.route.name === 'image-build') {
          return { route: state.route.from ?? { name: 'images' }, ...cleared };
        }
        if (state.route.name === 'templates') {
          return { route: state.route.from ?? { name: 'containers' }, ...cleared };
        }
        if (state.route.name === 'container-new') {
          return { route: state.route.from ?? { name: 'containers' }, ...cleared };
        }
        // Back from an edit is the container it was an edit of, which is where
        // it was opened from in every case but a route somebody hand-wrote.
        if (state.route.name === 'container-edit') {
          return {
            route: state.route.from ?? {
              name: 'container' as const,
              id: state.route.id,
              tab: 'overview' as const,
            },
            ...cleared,
          };
        }
        if (state.route.name === 'container') return { route: { name: 'containers' }, ...cleared };
        if (state.route.name === 'machine') return { route: { name: 'machines' }, ...cleared };
        if (state.route.name === 'image') return { route: { name: 'images' }, ...cleared };
        if (state.route.name === 'network') return { route: { name: 'networks' }, ...cleared };
        if (state.route.name === 'volume') return { route: { name: 'volumes' }, ...cleared };
        return state;
      })
    ),
  setGlobalQuery: (globalQuery) => set({ globalQuery }),
}));
