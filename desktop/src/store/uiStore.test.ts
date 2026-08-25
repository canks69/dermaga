import { beforeEach, describe, expect, it } from 'vitest';
import { askBeforeLeaving, useUIStore } from './uiStore';
import type { TunnelRoute } from '../types';

/**
 * A search that outlived the navigation it started would leave the results
 * page drawn over whatever the user had just asked to see — they press a
 * result, and land back on the list of results.
 *
 * This replaces a suite about intents, which the command palette set and
 * nothing else did. The palette is gone and the search that used to live in it
 * is in the title bar, so what has to be let go of on the way somewhere is the
 * query rather than an intent — the same invariant about the same act.
 */
describe('the title bar search', () => {
  beforeEach(() => {
    useUIStore.setState({ route: { name: 'containers' }, globalQuery: '' });
  });

  it('is cleared by every way of moving', () => {
    const moves: [string, () => void][] = [
      ['navigate', () => useUIStore.getState().navigate({ name: 'volumes' })],
      ['newContainer', () => useUIStore.getState().newContainer()],
      ['browseTemplates', () => useUIStore.getState().browseTemplates()],
      ['buildImage', () => useUIStore.getState().buildImage()],
      ['newMachine', () => useUIStore.getState().newMachine()],
      ['addRoute', () => useUIStore.getState().addRoute()],
      ['openContainer', () => useUIStore.getState().openContainer('web')],
      ['openImage', () => useUIStore.getState().openImage('alpine:latest')],
      ['openMachine', () => useUIStore.getState().openMachine('default')],
      ['openNetwork', () => useUIStore.getState().openNetwork('backend')],
      ['openVolume', () => useUIStore.getState().openVolume('pgdata')],
    ];

    for (const [name, move] of moves) {
      useUIStore.getState().setGlobalQuery('alpine');
      move();

      expect(useUIStore.getState().globalQuery, `${name} left the search standing`).toBe('');
    }
  });

  it('is cleared by going back from a detail page', () => {
    useUIStore.setState({ route: { name: 'image', reference: 'alpine:latest' } });
    useUIStore.getState().setGlobalQuery('alpine');

    useUIStore.getState().back();

    expect(useUIStore.getState().globalQuery).toBe('');
    expect(useUIStore.getState().route).toEqual({ name: 'images' });
  });

  it('survives being typed into, which is the whole point', () => {
    useUIStore.getState().setGlobalQuery('redis');

    expect(useUIStore.getState().globalQuery).toBe('redis');
    // Typing is not navigating: the route underneath is untouched, so clearing
    // the box puts the user back where they were.
    expect(useUIStore.getState().route).toEqual({ name: 'containers' });
  });
});

/**
 * Creating a container is a page rather than a dialog over the list, so the
 * way out of it is the same back link every other page has -- and there is
 * more than one way in. An image run from its own page that came back to the
 * container list would leave the user somewhere they never asked to be.
 */
describe('the form that makes a container', () => {
  beforeEach(() => {
    useUIStore.setState({ route: { name: 'containers' }, globalQuery: '' });
  });

  it('remembers what it was opened from, and what it was opened with', () => {
    useUIStore.setState({ route: { name: 'image', reference: 'redis:8' } });

    useUIStore.getState().newContainer({ image: 'redis:8' });

    expect(useUIStore.getState().route).toEqual({
      name: 'container-new',
      initial: { image: 'redis:8' },
      from: { name: 'image', reference: 'redis:8' },
    });

    useUIStore.getState().back();

    expect(useUIStore.getState().route).toEqual({ name: 'image', reference: 'redis:8' });
  });

  it('edits from the container it was opened on, and goes back to it', () => {
    const spec = { name: 'whoami', image: 'traefik/whoami:v1.10' };
    useUIStore.setState({ route: { name: 'container', id: 'whoami', tab: 'logs' } });

    useUIStore.getState().editContainer('whoami', spec);

    expect(useUIStore.getState().route).toEqual({
      name: 'container-edit',
      id: 'whoami',
      initial: spec,
      resumed: undefined,
      from: { name: 'container', id: 'whoami', tab: 'logs' },
    });

    useUIStore.getState().back();

    // The tab it was opened from, not the top of the container: the pencil is
    // pressed from wherever you were reading.
    expect(useUIStore.getState().route).toEqual({ name: 'container', id: 'whoami', tab: 'logs' });
  });

  it('leaves an edit for the container itself when it does not know where it came from', () => {
    useUIStore.setState({
      route: { name: 'container-edit', id: 'whoami', initial: { name: 'whoami', image: 'x' } },
    });

    useUIStore.getState().back();

    expect(useUIStore.getState().route).toEqual({
      name: 'container',
      id: 'whoami',
      tab: 'overview',
    });
  });

  it('leaves for the container list when it does not know where it came from', () => {
    useUIStore.setState({ route: { name: 'container-new' } });

    useUIStore.getState().back();

    expect(useUIStore.getState().route).toEqual({ name: 'containers' });
  });
});

/**
 * The catalogue is a step on the way to the form, not a destination: it is
 * opened from somewhere, picked from into somewhere else, and both directions
 * have to lead back out.
 */
describe('the template catalogue', () => {
  it('takes a pick to the form, and leaves a way back to both', () => {
    useUIStore.setState({ route: { name: 'containers' } });

    useUIStore.getState().browseTemplates();
    expect(useUIStore.getState().route).toEqual({
      name: 'templates',
      from: { name: 'containers' },
    });

    useUIStore.getState().newContainer({ image: 'ghcr.io/immich-app/immich-server:v1.120' });

    // Back out of the form is the catalogue it was picked from, and back out
    // of that is where the catalogue was opened.
    useUIStore.getState().back();
    expect(useUIStore.getState().route).toEqual({
      name: 'templates',
      from: { name: 'containers' },
    });

    useUIStore.getState().back();
    expect(useUIStore.getState().route).toEqual({ name: 'containers' });
  });
});

/**
 * The build form is the one page that can be opened from anywhere: the whole
 * window takes a dropped Dockerfile, so where it goes back to is wherever the
 * file happened to land.
 */
describe('the build form', () => {
  const drop = { context: '/Users/you/api', dockerfile: 'Dockerfile', name: 'api' };

  it('goes back to where the file was dropped, not to the image list', () => {
    useUIStore.setState({ route: { name: 'container', id: 'api', tab: 'logs' } });

    useUIStore.getState().buildImage({ drop });
    expect(useUIStore.getState().route).toMatchObject({ name: 'image-build', drop });

    useUIStore.getState().back();

    expect(useUIStore.getState().route).toEqual({ name: 'container', id: 'api', tab: 'logs' });
  });

  it('does not become its own way back when a second file is dropped on it', () => {
    useUIStore.setState({ route: { name: 'images' } });

    useUIStore.getState().buildImage({ drop });
    useUIStore.getState().buildImage({ drop: { context: '/Users/you/web' } });

    expect(useUIStore.getState().route).toMatchObject({
      name: 'image-build',
      drop: { context: '/Users/you/web' },
      from: { name: 'images' },
    });

    useUIStore.getState().back();

    expect(useUIStore.getState().route).toEqual({ name: 'images' });
  });

  it('opens on the half that was asked for', () => {
    useUIStore.getState().buildImage({ start: 'paste' });

    expect(useUIStore.getState().route).toMatchObject({ name: 'image-build', start: 'paste' });
  });
});

/**
 * The page a build prints onto.
 *
 * Pressing Build leaves the form for it, so the form must not be what pressing
 * back returns to: an empty one, offering to do the whole thing again.
 */
describe('the log a run prints', () => {
  it('goes back past the form that started it', () => {
    useUIStore.setState({ route: { name: 'images' } });

    useUIStore.getState().buildImage({ start: 'folder' });
    useUIStore.getState().openTask('build:api:dev');

    expect(useUIStore.getState().route).toEqual({
      name: 'task',
      id: 'build:api:dev',
      from: { name: 'images' },
    });

    useUIStore.getState().back();

    expect(useUIStore.getState().route).toEqual({ name: 'images' });
  });

  it('keeps the way out when one log is opened from another', () => {
    useUIStore.setState({ route: { name: 'containers' } });

    useUIStore.getState().openTask('build:api:dev');
    useUIStore.getState().openTask('pull:redis:8.10');

    expect(useUIStore.getState().route).toEqual({
      name: 'task',
      id: 'pull:redis:8.10',
      from: { name: 'containers' },
    });
  });

  it('is left by every way of moving, like any other page', () => {
    useUIStore.setState({ route: { name: 'task', id: 'build:api' } });
    useUIStore.getState().setGlobalQuery('api');

    useUIStore.getState().openTask('build:web');

    expect(useUIStore.getState().globalQuery).toBe('');
  });
});

/**
 * Publishing a hostname. Adding and moving are the same page, and a move
 * carries the route it replaces rather than looking it up again.
 */
describe('the route form', () => {
  const route: TunnelRoute = {
    hostname: 'api.example.com',
    zoneId: 'zone-1',
    zoneName: 'example.com',
    subdomain: 'api',
    kind: 'container',
    target: 'api',
    port: '80',
    address: '192.168.64.3',
    tunnelId: 'tunnel-1',
    accountId: 'account-1',
    created: '2026-08-25T00:00:00Z',
    status: 'running',
    reachable: true,
  };

  it('opens empty for an addition', () => {
    useUIStore.setState({ route: { name: 'tunnels' } });

    useUIStore.getState().addRoute();

    expect(useUIStore.getState().route).toEqual({
      name: 'tunnel-route',
      editing: undefined,
      from: { name: 'tunnels' },
    });
  });

  it('carries the route being moved', () => {
    useUIStore.setState({ route: { name: 'tunnels' } });

    useUIStore.getState().addRoute(route);

    expect(useUIStore.getState().route).toMatchObject({ name: 'tunnel-route', editing: route });

    useUIStore.getState().back();

    expect(useUIStore.getState().route).toEqual({ name: 'tunnels' });
  });

  it('goes back to the tunnels page when it does not know where it came from', () => {
    useUIStore.setState({ route: { name: 'tunnel-route' } });

    useUIStore.getState().back();

    expect(useUIStore.getState().route).toEqual({ name: 'tunnels' });
  });
});

/**
 * A machine is a pull and a boot, so its form ends on the log like the other
 * two -- and back from there must not be the form again.
 */
describe('the form that makes a machine', () => {
  it('goes back to where it was opened from', () => {
    useUIStore.setState({ route: { name: 'machines' } });

    useUIStore.getState().newMachine();
    expect(useUIStore.getState().route).toEqual({
      name: 'machine-new',
      from: { name: 'machines' },
    });

    useUIStore.getState().back();

    expect(useUIStore.getState().route).toEqual({ name: 'machines' });
  });

  it('hands its way out to the log the run prints on', () => {
    useUIStore.setState({ route: { name: 'machines' } });

    useUIStore.getState().newMachine();
    useUIStore.getState().openTask('machine:dev');

    expect(useUIStore.getState().route).toEqual({
      name: 'task',
      id: 'machine:dev',
      from: { name: 'machines' },
    });
  });
});

/**
 * A form is a page now, which puts the sidebar beside it for the whole time it
 * is being filled in. Nothing used to stand between a stray click there and
 * thirty fields of typing.
 */
describe('leaving a form that has been typed into', () => {
  beforeEach(() => {
    askBeforeLeaving(null);
    useUIStore.setState({ route: { name: 'container-new' }, held: null, globalQuery: '' });
  });

  it('holds the move rather than making it', () => {
    askBeforeLeaving(() => true);
    useUIStore.getState().navigate({ name: 'volumes' });

    expect(useUIStore.getState().route.name, 'the form was left anyway').toBe('container-new');
    expect(useUIStore.getState().held?.route).toEqual({ name: 'volumes' });
  });

  it('holds it whichever way out was taken', () => {
    const ways: [string, () => void][] = [
      ['navigate', () => useUIStore.getState().navigate({ name: 'volumes' })],
      ['back', () => useUIStore.getState().back()],
      ['openContainer', () => useUIStore.getState().openContainer('web')],
      ['openImage', () => useUIStore.getState().openImage('alpine:latest')],
      ['openTask', () => useUIStore.getState().openTask('build-7')],
      ['browseTemplates', () => useUIStore.getState().browseTemplates()],
      ['newMachine', () => useUIStore.getState().newMachine()],
      ['addRoute', () => useUIStore.getState().addRoute()],
    ];

    for (const [name, way] of ways) {
      useUIStore.setState({ route: { name: 'container-new' }, held: null });
      askBeforeLeaving(() => true);
      way();

      expect(useUIStore.getState().route.name, `${name} walked straight past the question`).toBe(
        'container-new'
      );
      expect(useUIStore.getState().held, `${name} asked nothing`).not.toBeNull();
    }
  });

  it('makes the move once it has been answered', () => {
    askBeforeLeaving(() => true);
    useUIStore.getState().navigate({ name: 'volumes' });
    useUIStore.getState().goAnyway();

    expect(useUIStore.getState().route).toEqual({ name: 'volumes' });
    expect(useUIStore.getState().held).toBeNull();
  });

  it('stays put, and forgets where it was going', () => {
    askBeforeLeaving(() => true);
    useUIStore.getState().navigate({ name: 'volumes' });
    useUIStore.getState().stay();

    expect(useUIStore.getState().route.name).toBe('container-new');
    expect(useUIStore.getState().held).toBeNull();
  });

  // A form with nothing in it is not worth a question, and neither is a page
  // that has already gone -- which is what the cleanup hands back.
  it('asks nothing when there is nothing to lose', () => {
    askBeforeLeaving(() => false);
    useUIStore.getState().navigate({ name: 'volumes' });
    expect(useUIStore.getState().route).toEqual({ name: 'volumes' });

    useUIStore.setState({ route: { name: 'container-new' }, held: null });
    askBeforeLeaving(null);
    useUIStore.getState().navigate({ name: 'images' });
    expect(useUIStore.getState().route).toEqual({ name: 'images' });
  });

  // Started work is not unsaved work. The form that has just built something
  // navigates to what it is printing, and must not be asked about on the way.
  it('lets a form that has submitted go', () => {
    askBeforeLeaving(() => true);
    askBeforeLeaving(null);
    useUIStore.getState().openTask('build-7');

    expect(useUIStore.getState().route.name).toBe('task');
    expect(useUIStore.getState().held).toBeNull();
  });
});
