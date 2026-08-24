import { describe, expect, it } from 'vitest';
import { asked, nameOf, suggestedTag } from './ImageBuildPage';
import type { BuildSpec } from '../types';

const folderBuild = (over: Partial<BuildSpec> = {}): BuildSpec => ({
  context: '/Users/you/projects/api',
  tag: 'api:dev',
  buildArgs: [],
  noCache: false,
  ...over,
});

/**
 * What a build is called, which is what the task strip will say for the next
 * few minutes.
 */
describe('the name a build goes by', () => {
  it('is the tag when there is one', () => {
    expect(nameOf(folderBuild())).toBe('api:dev');
  });

  it('falls back to the folder, which is what somebody would have typed', () => {
    expect(nameOf(folderBuild({ tag: undefined }))).toBe('api');
    expect(nameOf(folderBuild({ tag: undefined, context: '/Users/you/projects/api/' }))).toBe(
      'api'
    );
  });

  it('has something to say for a paste with no folder behind it', () => {
    expect(
      nameOf({ context: '', dockerfileText: 'FROM alpine', buildArgs: [], noCache: false })
    ).toBe('image');
  });
});

/**
 * The question the Build button asks.
 *
 * A build is minutes of work against a path somebody typed, so this is the
 * last place to notice the wrong project, a tag left over from the last one,
 * or a cache switched off that did not need to be.
 */
describe('the question the build button asks', () => {
  it('names what is built and what it will be called', () => {
    const question = asked(folderBuild({ dockerfile: 'Dockerfile.dev' }), false);

    expect(question.title).toBe('Build api:dev?');
    expect(question.confirmLabel).toBe('Build');
    expect(question.body).toContain('/Users/you/projects/api is built with Dockerfile.dev.');
    expect(question.body).toContain('The image is tagged api:dev.');
  });

  it('says when nothing will be tagged', () => {
    expect(asked(folderBuild({ tag: undefined }), false).body).toContain('left untagged');
  });

  it('knows a paste from a folder', () => {
    const pasted = asked(
      { context: '', dockerfileText: 'FROM alpine', buildArgs: [], noCache: false, tag: 'x:1' },
      false
    );

    expect(pasted.body).toContain('built on its own, with no folder behind it');
  });

  it('names the build arguments without quoting what is in them', () => {
    const question = asked(folderBuild({ buildArgs: ['VERSION=1.2.3', 'TOKEN=hunter2'] }), false);

    expect(question.body).toContain('VERSION and TOKEN are passed as build arguments.');
    expect(question.body).not.toContain('hunter2');
  });

  it('leaves out everything that was left alone', () => {
    const question = asked(folderBuild(), false);

    expect(question.body).not.toContain('stage');
    expect(question.body).not.toContain('cache');
    expect(question.body).not.toContain('build container');
  });

  it('says the slow parts before they happen', () => {
    const question = asked(folderBuild({ noCache: true, target: 'builder' }), true);

    expect(question.body).toContain('It stops at the builder stage.');
    expect(question.body).toContain('The cache is not used, so every step runs again.');
    expect(question.body).toContain(
      'The build container is not running yet, so it is started first.'
    );
  });
});

/**
 * The one suggestion this form makes, and the one place it may rewrite
 * anything: a folder is named by a person, and a registry will not take a
 * capital letter.
 */
describe('a folder name offered as a tag', () => {
  it('is lowercased, because a registry refuses anything else', () => {
    expect(suggestedTag('Portfolio')).toBe('portfolio');
    expect(suggestedTag('MyAPI')).toBe('myapi');
  });

  it('leaves alone what was already a tag', () => {
    expect(suggestedTag('api')).toBe('api');
    expect(suggestedTag('web-app_2.0')).toBe('web-app_2.0');
  });

  it('turns what a name cannot carry into a word break', () => {
    expect(suggestedTag('Client Work')).toBe('client-work');
    expect(suggestedTag('api (old)')).toBe('api-old');
  });

  it('begins and ends on a letter or a digit', () => {
    expect(suggestedTag('.hidden')).toBe('hidden');
    expect(suggestedTag('api-')).toBe('api');
    expect(suggestedTag('  spaced  ')).toBe('spaced');
  });

  it('has nothing to suggest from a name with nothing in it', () => {
    expect(suggestedTag('***')).toBe('');
    expect(suggestedTag('')).toBe('');
  });
});
