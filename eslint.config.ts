import antfu from '@antfu/eslint-config';

export default antfu({
  type: 'app',
  react: true,
  markdown: false,
  typescript: true,
  stylistic: {
    indent: 2,
    quotes: 'single',
    semi: true,
  },
  ignores: ['dist/**', 'coverage/**', 'docs/**', 'src/components/ui/**', 'scripts/**', 'src/data/catalogue/catalogue.json'],
});
