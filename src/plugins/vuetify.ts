import 'vuetify/styles'
import '@tabler/icons-webfont/dist/tabler-icons.min.css'

import { createVuetify } from 'vuetify'
import { VSnackbar } from 'vuetify/components/VSnackbar'
import { resolveVuetifyColors } from '@design-system/themes/vuetify-colors'
import { defaultAccent } from '@design-system/themes/accents'

export default createVuetify({
  components: { VSnackbar },
  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: { dark: true, colors: resolveVuetifyColors('dark', defaultAccent) },
      light: { dark: false, colors: resolveVuetifyColors('light', defaultAccent) },
    },
  }
})
