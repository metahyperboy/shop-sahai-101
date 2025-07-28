export default {
  presets: [
    ['@babel/preset-env', { 
      targets: { node: 'current' },
      modules: false,
      useBuiltIns: 'usage',
      corejs: 3
    }],
    ['@babel/preset-react', { 
      runtime: 'automatic',
      importSource: '@emotion/react'
    }],
    '@babel/preset-typescript',
  ],
  plugins: [
    '@babel/plugin-transform-runtime',
    '@babel/plugin-proposal-class-properties',
    '@babel/plugin-proposal-optional-chaining',
    '@babel/plugin-proposal-nullish-coalescing-operator'
  ]
};
