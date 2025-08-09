
module.exports = {
  content: ["./*.html"],
  theme: {
    extend: {
      colors: {
        n0: '#FFFFFF',
        n05: '#F5F5F5',
        n3: '#A0A0A0',
        n5: '#666666',
        n7: '#333333',
        n8: '#080808',
        p1: '#0163A4',
        s3: '#FBB82F',
        'n05-90': 'rgba(245, 245, 245, 0.9)',
        'n0-10': 'rgba(255, 255, 255, 0.1)',
      },
      fontFamily: {
        poppins: ['Poppins', 'sans-serif'],
      },
      fontSize: {
        caption: ['0.75rem', { lineHeight: '1rem' }],
        caption2: ['0.7rem', { lineHeight: '1rem' }],
        body15: ['0.9375rem', { lineHeight: '1.25rem' }],
        body2: ['1rem', { lineHeight: '1.5rem' }],
        h3: ['1.5rem', { lineHeight: '2rem' }],
      },
      spacing: {
        '15': '3.75rem', /* For Tawk.to widget height */
      },
      boxShadow: {
        button: '0 4px 6px rgba(0, 0, 0, 0.1)',
      },
    },
  },
};