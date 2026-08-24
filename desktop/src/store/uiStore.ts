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

export const useUIStore = create<UIState>((set) => ({
  route: { name: 'containers' },
  globalQuery: '',
  intent: null,
  intentTarget: null,
  // Moving clears the search: the page you asked for is the page you land on.
  // Every other way of moving drops a pending intent too -- arriving somewhere
  // by another route means the user changed their mind.
  navigate: (route) => set({ route, intent: null, intentTarget: null, globalQuery: '' }),
  // Navigates and asks the page it lands on to open something, which is how a
  // search result can be "Pull an image" rather than "go to Images and find
  // the button".
  navigateWith: (route, intent, target) =>
    set({ route, intent, intentTarget: target ?? null, globalQuery: '' }),
  clearIntent: () => set({ intent: null, intentTarget: null }),
  newContainer: (initial) =>
    set((state) => ({
      // The page it was opened from, not the one before that: a create opened
      // from another create cannot happen, and anything else is one step back.
      route: { name: 'container-new', initial, from: state.route },
      intent: null,
      intentTarget: null,
      globalQuery: '',
    })),
  editContainer: (id, initial, resumed) =>
    set((state) => ({
      route: { name: 'container-edit', id, initial, resumed, from: state.route },
      intent: null,
      intentTarget: null,
      globalQuery: '',
    })),
  browseTemplates: () =>
    set((state) => ({
      route: { name: 'templates', from: state.route },
      intent: null,
      intentTarget: null,
      globalQuery: '',
    })),
  buildImage: (opening) =>
    set((state) => ({
      route: {
        name: 'image-build',
        start: opening?.start,
        drop: opening?.drop,
        // A second Dockerfile dropped while this page is open must not make
        // the page its own way back: keep the one it already had.
        from: state.route.name === 'image-build' ? state.route.from : state.route,
      },
      intent: null,
      intentTarget: null,
      globalQuery: '',
    })),
  openTask: (id) =>
    set((state) => ({ route: { name: 'task', id, from: behind(state.route) }, ...clearedOnMove })),
  addRoute: (editing) =>
    set((state) => ({
      route: { name: 'tunnel-route', editing, from: behind(state.route) },
      ...clearedOnMove,
    })),
  newMachine: () =>
    set((state) => ({
      route: { name: 'machine-new', from: behind(state.route) },
      ...clearedOnMove,
    })),
  // Logs, not Inspect. A container is opened to see what it is saying far more
  // often than to read back the flags it was started with, and the flags are
  // one tab away either way.
  openContainer: (id, tab = 'logs', path) =>
    set({
      route: { name: 'container', id, tab, path },
      globalQuery: '',
    }),
  openMachine: (id, tab = 'overview') =>
    set({ route: { name: 'machine', id, tab }, intent: null, intentTarget: null, globalQuery: '' }),
  openImage: (reference) =>
    set({ route: { name: 'image', reference }, intent: null, intentTarget: null, globalQuery: '' }),
  openNetwork: (name) =>
    set({
      route: { name: 'network', network: name },
      globalQuery: '',
    }),
  openVolume: (name) =>
    set({
      route: { name: 'volume', volume: name },
      globalQuery: '',
    }),
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
    set((state) => {
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
    }),
  setGlobalQuery: (globalQuery) => set({ globalQuery }),
}));
