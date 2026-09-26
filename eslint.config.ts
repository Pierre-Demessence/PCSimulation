import antfu from '@antfu/eslint-config';

export default antfu({
  type: 'app',
  markdown: false,
  typescript: true,
  stylistic: {
    indent: 2,
    quotes: 'single',
    semi: true,
  },
  ignores: ['dist/**', 'coverage/**', 'docs/**'],
});
