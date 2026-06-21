import type { PlopTypes } from '@turbo/gen';

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator('package', {
    description: 'Create a new @repo/* package',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Package name (without @repo/ prefix):',
        validate: (input: string) =>
          /^[a-z][a-z0-9-]*$/.test(input) || 'Use kebab-case: lowercase letters, digits, hyphens',
      },
      {
        type: 'input',
        name: 'description',
        message: 'Short description:',
        default: '',
      },
    ],
    actions: [
      {
        type: 'add',
        path: '{{ turbo.paths.root }}/packages/{{ name }}/package.json',
        templateFile: 'templates/package.json.hbs',
      },
      {
        type: 'add',
        path: '{{ turbo.paths.root }}/packages/{{ name }}/tsconfig.json',
        templateFile: 'templates/tsconfig.json.hbs',
      },
      {
        type: 'add',
        path: '{{ turbo.paths.root }}/packages/{{ name }}/tsdown.config.ts',
        templateFile: 'templates/tsdown.config.ts.hbs',
      },
      {
        type: 'add',
        path: '{{ turbo.paths.root }}/packages/{{ name }}/src/index.ts',
        templateFile: 'templates/src/index.ts.hbs',
      },
      {
        type: 'add',
        path: '{{ turbo.paths.root }}/packages/{{ name }}/.gitignore',
        templateFile: 'templates/.gitignore.hbs',
      },
    ],
  });
}
