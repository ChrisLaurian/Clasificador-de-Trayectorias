// Envuelve handlers async para que las promesas rechazadas caigan en el
// middleware de errores de Express 4 (que solo captura errores síncronos).
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
