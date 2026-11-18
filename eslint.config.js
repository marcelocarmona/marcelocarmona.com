const nextCoreWebVitals = require('eslint-config-next/core-web-vitals')
const prettierRecommended = require('eslint-plugin-prettier/recommended')
const reactDoctor = require('eslint-plugin-react-doctor').default

module.exports = [
  ...nextCoreWebVitals,
  reactDoctor.configs.recommended,
  reactDoctor.configs.next,
  prettierRecommended,
  {
    rules: {
      'prettier/prettier': 'error',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-unused-vars': 'off',
      'react/no-unescaped-entities': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/set-state-in-effect': 'off',

      // React Doctor rules that don't fit this stack. Everything else stays on.
      // Fast Refresh only matters for client modules; the flagged files are server
      // modules that also export metadata, generate* helpers or analytics helpers.
      'react-doctor/only-export-components': 'off',
      // Ref callback cleanups are supported since React 19, which this project uses.
      'react-doctor/no-ref-callback-cleanup-before-react-19': 'off',
    },
  },
]
