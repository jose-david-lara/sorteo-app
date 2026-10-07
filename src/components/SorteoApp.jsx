import React, { useState, useEffect, useMemo, useRef } from 'react';
import { leerParticipantes, validarArchivo, exportarExcel, descargarActaJson } from '../lib/excel';
import { confirmarLista, construirActa, obtenerElegibles, realizarSorteo, sha256Hex } from '../lib/sorteo';
import { SESION_VACIA, cargarSesion, guardarSesion, borrarSesion } from '../lib/persistencia';
import logo from '../camp300.png';
import './SorteoApp.css';

// Tómbola: los tiempos deben coincidir con las animaciones .mezclando y balota-cae del CSS.
const DURACION_MEZCLA = 2600;
const DURACION_ANIMACION = 4000;
const COLORES_BOLAS = ['#001091', '#4051aa', '#8595c9', '#ffffff', '#000a5c', '#c7d0ec'];

// Bolas decorativas dentro de la tómbola: cada una orbita con radio, ángulo y velocidad propios.
const BOLAS = Array.from({ length: 16 }, (_, i) => ({
  id: i,
  color: COLORES_BOLAS[i % COLORES_BOLAS.length],
  angulo: `${(i * 137) % 360}deg`,
  radio: `${30 + (i * 23) % 60}px`,
  velocidad: `${0.6 + (i % 5) * 0.15}s`,
  sentido: i % 2 === 0 ? 'normal' : 'reverse'
}));
const COLORES_CONFETI = ['#001091', '#4051aa', '#8595c9', '#ff932d', '#77797c'];

function mensajeInicial({ participantes, sorteos }) {
  if (sorteos.length > 0) return sorteos[sorteos.length - 1].nombre;
  if (participantes.length > 0) return `${participantes.length} participantes cargados`;
  return 'Carga tu Excel';
}

const SorteoApp = () => {
  // La sesión (lista, confirmación y sorteos) se persiste; el resto es estado visual.
  const [sesion, setSesion] = useState(cargarSesion);
  const [currentDisplay, setCurrentDisplay] = useState(() => mensajeInicial(sesion));
  const [error, setError] = useState('');
  const [isSpinning, setIsSpinning] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  // null = tómbola en reposo; si no, { numero, fase: 'mezclando' | 'cayendo' | 'listo' }
  const [tombola, setTombola] = useState(null);
  const temporizadores = useRef([]);

  const programar = (fn, ms) => temporizadores.current.push(setTimeout(fn, ms));
  const cancelarTemporizadores = () => {
    temporizadores.current.forEach(clearTimeout);
    temporizadores.current = [];
  };

  const { archivo, participantes, advertencias, confirmacion, sorteos } = sesion;
  const listaConfirmada = confirmacion !== null;
  const elegibles = useMemo(() => obtenerElegibles(participantes, sorteos), [participantes, sorteos]);
  const sorteadosIds = useMemo(() => new Set(sorteos.map(s => s.participanteId)), [sorteos]);
  const activos = participantes.filter(p => p.activo).length;

  const visibles = participantes.filter(p =>
    p.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    guardarSesion(sesion);
  }, [sesion]);

  useEffect(() => () => temporizadores.current.forEach(clearTimeout), []);

  // Ocultar confeti después de la animación
  useEffect(() => {
    if (showConfetti) {
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showConfetti]);

  const confetti = useMemo(() => {
    if (!showConfetti) return null;
    return Array.from({ length: 50 }, (_, i) => {
      const shape = Math.floor(Math.random() * 3);
      const style = {
        left: `${Math.random() * 100}%`,
        animationDelay: `${Math.random() * 0.5}s`,
        backgroundColor: COLORES_CONFETI[Math.floor(Math.random() * COLORES_CONFETI.length)]
      };
      if (shape === 0) {
        style.borderRadius = '50%';
      } else if (shape === 1) {
        style.width = '7px';
        style.height = '14px';
      }
      return <div key={i} className="confetti" style={style} />;
    });
  }, [showConfetti]);

  // Cargar archivo Excel
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;

    if (listaConfirmada && !window.confirm(
      'Cargar un nuevo archivo descarta la lista confirmada y los sorteos actuales. ¿Continuar?'
    )) {
      return;
    }

    const errorArchivo = validarArchivo(file);
    if (errorArchivo) {
      setError(errorArchivo);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const bytes = new Uint8Array(e.target.result);
        const resultado = leerParticipantes(bytes);
        if (resultado.participantes.length === 0) {
          throw new Error('El archivo no contiene nombres de participantes');
        }
        const nuevaSesion = {
          ...SESION_VACIA,
          archivo: { nombre: file.name, sha256: sha256Hex(bytes) },
          participantes: resultado.participantes,
          advertencias: resultado.advertencias
        };
        setSesion(nuevaSesion);
        setTombola(null);
        setError('');
        setSearchTerm('');
        setCurrentDisplay(mensajeInicial(nuevaSesion));
      } catch (err) {
        console.error('Error al procesar el archivo:', err);
        setError(err.message || 'Error al procesar el archivo');
      }
    };
    reader.onerror = () => setError('No se pudo leer el archivo');
    reader.readAsArrayBuffer(file);
  };

  // Activar/excluir participante (solo antes de confirmar la lista)
  const toggleParticipant = (id) => {
    if (listaConfirmada) return;
    setSesion(prev => ({
      ...prev,
      participantes: prev.participantes.map(p => p.id === id ? { ...p, activo: !p.activo } : p)
    }));
  };

  const confirmar = () => {
    if (activos === 0) return;
    setSesion(prev => ({ ...prev, confirmacion: confirmarLista(prev.participantes) }));
    setTombola(null);
    setCurrentDisplay('Lista confirmada');
  };

  // Iniciar sorteo: el resultado se calcula antes de la animación, que es solo visual.
  const startLottery = () => {
    if (!listaConfirmada || isSpinning) return;
    if (elegibles.length === 0) {
      setCurrentDisplay('No hay participantes elegibles');
      return;
    }

    const resultado = realizarSorteo(confirmacion.semilla, participantes, sorteos);
    setIsSpinning(true);
    setTombola({ numero: resultado.numero, fase: 'mezclando' });

    programar(() => setTombola(t => t && { ...t, fase: 'cayendo' }), DURACION_MEZCLA);
    programar(() => {
      setSesion(prev => ({ ...prev, sorteos: [...prev.sorteos, resultado] }));
      setCurrentDisplay(resultado.nombre);
      setTombola(t => t && { ...t, fase: 'listo' });
      setIsSpinning(false);
      setShowConfetti(true);
    }, DURACION_ANIMACION);
  };

  const acta = () => construirActa(sesion);

  const ultimo = sorteos[sorteos.length - 1];
  const mostrarSello = !isSpinning && ultimo && currentDisplay === ultimo.nombre;
  const fase = tombola?.fase;

  // Reiniciar todo
  const resetAll = () => {
    const aviso = sorteos.length > 0
      ? '¿Seguro que deseas reiniciar? Se perderán los sorteos realizados si no exportaste el acta.'
      : '¿Estás seguro de que deseas reiniciar todo?';
    if (window.confirm(aviso)) {
      cancelarTemporizadores();
      borrarSesion();
      setSesion(SESION_VACIA);
      setCurrentDisplay(mensajeInicial(SESION_VACIA));
      setIsSpinning(false);
      setTombola(null);
      setShowConfetti(false);
      setSearchTerm('');
      setError('');
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <img src={logo} alt="Centro de Arbitraje y Mediación Paraguay" className="company-logo" />
          <div className="app-title">
            <h1>Sorteo de Árbitros</h1>
            <p>Centro de Arbitraje y Mediación Paraguay</p>
          </div>
        </div>
      </header>

      <main className="sorteo-container">
        <div className="main-container">
          {/* Barra de carga del Excel y acciones */}
          <div className="upload-section">
            <div className="toolbar">
              <label className={`file-picker ${isSpinning ? 'is-disabled' : ''}`}>
                <span className="file-picker-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </span>
                <span className="file-picker-text">
                  <strong>{archivo?.nombre || 'Cargar lista de árbitros'}</strong>
                  <small>
                    {archivo
                      ? `${participantes.length} participantes · clic para cambiar el archivo`
                      : 'Excel .xlsx o .xls · máx. 5 MB · columna "Nombre"'}
                  </small>
                </span>
                <input
                  type="file"
                  style={{ display: 'none' }}
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  disabled={isSpinning}
                />
              </label>

              <div className="toolbar-actions">
                <button
                  onClick={() => exportarExcel(acta())}
                  disabled={!listaConfirmada || isSpinning}
                  className="btn btn-primary"
                  title={listaConfirmada ? 'Descargar el acta en Excel' : 'Confirma la lista para poder exportar el acta'}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Acta Excel
                </button>

                <button
                  onClick={() => descargarActaJson(acta())}
                  disabled={!listaConfirmada || isSpinning}
                  className="btn btn-secondary"
                  title="Archivo para verificar el sorteo de forma independiente"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Verificación
                </button>

                <button
                  onClick={resetAll}
                  disabled={participantes.length === 0 || isSpinning}
                  className="btn btn-danger"
                  title="Borrar la lista y los sorteos"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Limpiar
                </button>
              </div>
            </div>

            {error && <div className="alert alert-error" role="alert">{error}</div>}
            {advertencias.length > 0 && (
              <div className="alert alert-warning">
                <ul>
                  {advertencias.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
          </div>

          <div className="content-grid">
            {/* Esfera de sorteo */}
            <div className="lottery-container">
              <div className="relative">
                {/* Contenedor para el confeti */}
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
                  {confetti}
                </div>

                {/* Tómbola con balota */}
                <div className={`tombola ${fase === 'mezclando' ? 'mezclando' : ''}`}>
                  <div className="tombola-esfera">
                    <div className="tombola-aros" />
                    {BOLAS.map(b => (
                      <span
                        key={b.id}
                        className="tombola-bola"
                        style={{
                          '--angulo': b.angulo,
                          '--radio': b.radio,
                          '--velocidad': b.velocidad,
                          animationDirection: b.sentido,
                          backgroundColor: b.color
                        }}
                      />
                    ))}
                  </div>
                  <div className="tombola-conducto" />

                  {fase === 'cayendo' && (
                    <span className="balota">{tombola.numero}</span>
                  )}

                  <div className="tombola-bandeja">
                    {fase === 'mezclando' && <span className="bandeja-espera">Mezclando…</span>}
                    {(!fase || fase === 'listo') && (
                      <div key={currentDisplay} className={`balota-abierta ${fase === 'listo' ? 'abriendo' : ''}`}>
                        {currentDisplay}
                      </div>
                    )}
                  </div>
                </div>
                <p className="sr-only" aria-live="polite">{isSpinning ? 'Sorteando…' : currentDisplay}</p>

                <div className="stamp-slot">
                  {mostrarSello && (
                    <div key={ultimo.numero} className="stamp">
                      ⚖ Árbitro designado Nº {ultimo.numero}
                    </div>
                  )}
                </div>

                {listaConfirmada ? (
                  <button
                    onClick={startLottery}
                    disabled={isSpinning || elegibles.length === 0}
                    className="start-button"
                  >
                    {isSpinning ? 'Sorteando...' : '¡Iniciar Sorteo!'}
                  </button>
                ) : (
                  <button
                    onClick={confirmar}
                    disabled={activos === 0}
                    className="start-button"
                  >
                    Confirmar lista ({activos} activos)
                  </button>
                )}
              </div>
            </div>

            {/* Sección de Sorteados y Participantes */}
            <div className="list-container">
              {/* Lista de sorteados */}
              <div className="winners-list">
                <div className="list-header">
                  <svg xmlns="http://www.w3.org/2000/svg" className="winner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                  </svg>
                  <span>Árbitros sorteados</span>
                </div>
                <div className="list-content">
                  {sorteos.length > 0 ? (
                    sorteos.map(s => (
                      <div key={s.numero} className="winner-item">
                        <span className="winner-number">{s.numero}</span>
                        <span className="winner-name">{s.nombre}</span>
                      </div>
                    ))
                  ) : (
                    <p className="empty-message">Aún no hay árbitros sorteados</p>
                  )}
                </div>
              </div>

              {/* Lista de participantes */}
              <div className="participants-list">
                <div className="list-header">
                  <span>Participantes</span>
                  <span className="count-badge">
                    {activos} activos / {participantes.length} total{listaConfirmada ? ' · lista confirmada' : ''}
                  </span>
                </div>

                {participantes.length > 0 ? (
                  <>
                    <div className="search-container">
                      <input
                        type="text"
                        placeholder="Buscar participante..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                      />
                      {searchTerm && (
                        <button
                          className="search-clear"
                          onClick={() => setSearchTerm('')}
                          aria-label="Limpiar búsqueda"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    <div className="participants-grid">
                      {visibles.length > 0 ? (
                        visibles.map(participant => {
                          const sorteado = sorteadosIds.has(participant.id);
                          return (
                            <div
                              key={participant.id}
                              className={`participant-item ${
                                sorteado
                                  ? 'participant-winner'
                                  : !participant.activo
                                    ? 'participant-inactive'
                                    : ''
                              }`}
                            >
                              <span className={`participant-name ${sorteado ? 'winner-text' : ''}`}>
                                {participant.nombre}
                                {sorteado && <span className="winner-crown">⚖️</span>}
                              </span>

                              <label className="toggle-switch" title={listaConfirmada ? 'La lista ya está confirmada' : 'Activar / excluir'}>
                                <input
                                  type="checkbox"
                                  checked={participant.activo}
                                  onChange={() => toggleParticipant(participant.id)}
                                  disabled={listaConfirmada}
                                  aria-label={`Activar o excluir a ${participant.nombre}`}
                                />
                                <span className="toggle-slider"></span>
                              </label>
                            </div>
                          );
                        })
                      ) : (
                        <p className="empty-message">No se encontraron participantes con ese nombre</p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="empty-message">Carga un archivo Excel para ver los participantes</p>
                )}
              </div>
            </div>
          </div>
        </div>

      </main>

      <footer className="app-footer">
        <div className="footer-inner">
          <span>&copy; {new Date().getFullYear()} Centro de Arbitraje y Mediación Paraguay</span>
          <span className="footer-secondary">Cámara Nacional de Comercio y Servicios de Paraguay</span>
        </div>
      </footer>
    </div>
  );
};

export default SorteoApp;
