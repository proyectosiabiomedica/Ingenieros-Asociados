/* Ingenieros Asociados · configuración de Tailwind (v5.6)
   Solo se usa para REGENERAR estilos.css cuando se agregan clases nuevas:
     npx tailwindcss@3 -c tailwind.config.js -i estilos-fuente.css -o estilos.css --minify
   La plataforma publicada no necesita este archivo. */
module.exports = {
  content: ['./index.html', './app.js'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'sans-serif'] },
      colors: {
        // paleta institucional tomada del logotipo
        // (#005DA1 azul del isotipo · #ABE1F5 celeste de la "a")
        brand: {
          50:  '#F0F9FE', 100: '#DBF0FB', 200: '#ABE1F5', 300: '#7CCAEB',
          400: '#3E9FD1', 500: '#0E77B8', 600: '#005DA1', 700: '#004E88',
          800: '#003D6B', 900: '#002C4D', 950: '#001A2E'
        },
        kpi: { blue: '#005DA1', red: '#ef4444', green: '#10b981', orange: '#f97316', purple: '#8b5cf6' }
      }
    }
  }
};
