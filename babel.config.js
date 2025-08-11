module.exports = {
  presets: [
    ['@babel/preset-env', {
      targets: {
        node: 'current',
      },
    }],
    ['@babel/preset-react', {
      runtime: 'automatic',
    }],
  ],
  plugins: [
    '@babel/plugin-proposal-object-rest-spread',
    '@babel/plugin-syntax-class-properties',
  ],
  env: {
    test: {
      presets: [
        ['@babel/preset-env', {
          targets: {
            node: 'current',
          },
        }],
        ['@babel/preset-react', {
          runtime: 'automatic',
        }],
      ],
    },
  },
};