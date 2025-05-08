import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import './SorteoApp.css';

const SorteoApp = () => {
  // Estados para manejar participantes y sorteo
  const [participants, setParticipants] = useState([]);
  const [winners, setWinners] = useState([]);
  const [currentDisplay, setCurrentDisplay] = useState("Carga tu Excel");
  const [isSpinning, setIsSpinning] = useState(false);
  const [fileName, setFileName] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [balls, setBalls] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Filtrar participantes según término de búsqueda
  const filteredParticipants = participants.filter(participant => 
    participant.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // Generar bolas para la animación cuando cambian los participantes
  useEffect(() => {
    generateBalls();
  }, [participants.length]);
  
  // Ocultar confeti después de la animación
  useEffect(() => {
    if (showConfetti) {
      const timer = setTimeout(() => {
        setShowConfetti(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showConfetti]);
  
  // Generar bolas para la animación
  const generateBalls = () => {
    const newBalls = [];
    for (let i = 0; i < 12; i++) {
      const size = Math.random() * 20 + 20;
      const left = `${Math.random() * 70 + 15}%`;
      const top = `${Math.random() * 70 + 15}%`;
      const hue = Math.random() * 360;
      const duration = `${Math.random() * 3 + 2}s`;
      const delay = `${Math.random() * 2}s`;
      
      newBalls.push({
        id: i,
        size,
        left,
        top,
        color: `hsl(${hue}, 80%, 65%)`,
        duration,
        delay
      });
    }
    setBalls(newBalls);
  };
  
  // Generar confeti para la animación de ganador
  const renderConfetti = () => {
    if (!showConfetti) return null;
    
    const confetti = [];
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
    
    for (let i = 0; i < 50; i++) {
      const left = `${Math.random() * 100}%`;
      const delay = `${Math.random() * 0.5}s`;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const shape = Math.floor(Math.random() * 3);
      
      let style = {
        left: left,
        animationDelay: delay,
        backgroundColor: color
      };
      
      if (shape === 0) {
        style.borderRadius = '50%';
      } else if (shape === 1) {
        style.width = '7px';
        style.height = '14px';
      }
      
      confetti.push(
        <div 
          key={i}
          className="confetti"
          style={style}
        />
      );
    }
    
    return confetti;
  };
  
  // Cargar archivo Excel
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Obtener la primera hoja
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        
        // Convertir a JSON
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);
        
        // Transformar datos a formato requerido
        const formattedData = jsonData.map((row, index) => {
          // Intentar obtener el nombre desde diferentes posibles columnas
          const name = row.Nombre || row.nombre || row.Name || row.name || 
                     row.Participante || row.participante || Object.values(row)[0];
          
          return {
            id: index,
            name: name || `Participante ${index + 1}`,
            active: true,
            isWinner: false
          };
        });
        
        setParticipants(formattedData);
        setCurrentDisplay(`${formattedData.length} participantes cargados`);
      } catch (error) {
        console.error("Error al procesar el archivo:", error);
        setCurrentDisplay("Error al procesar el archivo");
      }
    };
    
    reader.readAsArrayBuffer(file);
  };
  
  // Cambiar estado de participante (activo/inactivo)
  const toggleParticipant = (id) => {
    setParticipants(prevState => 
      prevState.map(p => 
        p.id === id ? { ...p, active: !p.active } : p
      )
    );
  };
  
  // Iniciar sorteo
  const startLottery = () => {
    // Filtrar solo participantes activos que no han ganado
    const eligibleParticipants = participants.filter(p => p.active && !p.isWinner);
    
    if (eligibleParticipants.length === 0) {
      setCurrentDisplay("No hay participantes elegibles");
      return;
    }
    
    setIsSpinning(true);
    
    // Animación de sorteo - mostrar nombres aleatorios rápidamente
    let duration = 3000; // 3 segundos de animación
    let interval = 80; // Cambiar nombre cada 80ms
    let elapsed = 0;
    let timeoutId;
    
    const animateNames = () => {
      const randomIndex = Math.floor(Math.random() * eligibleParticipants.length);
      setCurrentDisplay(eligibleParticipants[randomIndex].name);
      
      elapsed += interval;
      
      // Ajustar velocidad para efecto de desaceleración
      if (elapsed > duration * 0.7) {
        interval += 10;
      }
      
      if (elapsed >= duration) {
        selectWinner(eligibleParticipants);
      } else {
        timeoutId = setTimeout(animateNames, interval);
      }
    };
    
    animateNames();
    
    // Limpieza en caso de desmontaje
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  };
  
  // Seleccionar ganador final
  const selectWinner = (eligibleParticipants) => {
    const winnerIndex = Math.floor(Math.random() * eligibleParticipants.length);
    const winner = eligibleParticipants[winnerIndex];
    
    // Actualizar estado del ganador
    setParticipants(prevState => 
      prevState.map(p => 
        p.id === winner.id ? { ...p, isWinner: true } : p
      )
    );
    
    // Agregar a lista de ganadores
    setWinners(prevWinners => [...prevWinners, winner]);
    
    // Mostrar ganador
    setCurrentDisplay(winner.name);
    setIsSpinning(false);
    
    // Mostrar confeti
    setShowConfetti(true);
  };
  
  // Exportar resultados a Excel
  const exportResults = () => {
    // Preparar datos para exportar
    const exportData = participants.map(p => ({
      Nombre: p.name,
      Estado: p.active ? "Activo" : "Inactivo",
      Resultado: p.isWinner ? "Ganador" : "No ganador"
    }));
    
    // Crear una nueva hoja de trabajo
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    // Crear libro
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Resultados");
    
    // Generar archivo Excel
    XLSX.writeFile(workbook, "resultados_sorteo.xlsx");
  };
  
  // Reiniciar todo
  const resetAll = () => {
    if (window.confirm("¿Estás seguro de que deseas reiniciar todo?")) {
      setParticipants([]);
      setWinners([]);
      setCurrentDisplay("Carga tu Excel");
      setFileName("");
      setShowConfetti(false);
      setSearchTerm("");
    }
  };
  
  return (
    <div className="sorteo-container">
      {/* Header con logo y nombre de empresa */}
      <header className="app-header">
        <div className="company-info">
          <div className="logo-container">
            <img src="camp300.png" alt="Logo de la empresa" className="company-logo" />
          </div>
          <div className="company-name">
            <h1>CAMP</h1>
            <p className="company-slogan">Centro de Arbitraje y Mediación Paraguay (CAMP)</p>
          </div>
        </div>
        <div className="app-title">
          <h2>Sorteo Árbitros</h2>
        </div>
      </header>
      
      {/* Main Container */}
      <div className="main-container">
        {/* Sección de carga de archivos */}
        <div className="upload-section">
          <h2>Cargar Participantes</h2>
          <div className="upload-container">
            <label className="upload-area">
              <svg xmlns="http://www.w3.org/2000/svg" className="upload-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="file-name">{fileName || "Seleccionar archivo Excel"}</p>
              <p className="file-format">Formatos: XLSX, XLS</p>
              <input 
                type="file" 
                style={{ display: 'none' }} 
                accept=".xlsx,.xls" 
                onChange={handleFileUpload} 
              />
            </label>
            
            <div className="button-container">
              <button 
                onClick={exportResults} 
                disabled={participants.length === 0}
                className={`export-button ${participants.length === 0 ? 'button-disabled' : ''}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Exportar Resultados
              </button>
              
              <button 
                onClick={resetAll}
                disabled={participants.length === 0}
                className={`reset-button ${participants.length === 0 ? 'button-disabled' : ''}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Limpiar Todo
              </button>
            </div>
          </div>
        </div>
        
        <div className="content-grid">
          {/* Esfera de sorteo */}
          <div className="lottery-container">
            <div className="relative">
              {/* Contenedor para el confeti */}
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
                {renderConfetti()}
              </div>
              
              {/* Esfera de sorteo */}
              <div className={`lottery-sphere ${isSpinning ? 'spinning' : ''}`}>
                {/* Bolas dentro de la esfera */}
                {balls.map(ball => (
                  <div 
                    key={ball.id}
                    className="lottery-ball"
                    style={{
                      width: `${ball.size}px`,
                      height: `${ball.size}px`,
                      left: ball.left,
                      top: ball.top,
                      backgroundColor: ball.color,
                      animationDuration: ball.duration,
                      animationDelay: ball.delay
                    }}
                  />
                ))}
                
                {/* Nombre del ganador/participante actual */}
                <div className="winner-display">
                  <p className="winner-name">{currentDisplay}</p>
                </div>
              </div>
              
              <button
                onClick={startLottery}
                disabled={isSpinning || participants.filter(p => p.active && !p.isWinner).length === 0}
                className="start-button"
              >
                {isSpinning ? "Sorteando..." : "¡Iniciar Sorteo!"}
              </button>
            </div>
          </div>
          
          {/* Sección de Ganadores y Participantes */}
          <div className="list-container">
            {/* Lista de ganadores */}
            <div className="winners-list">
              <div className="list-header">
                <svg xmlns="http://www.w3.org/2000/svg" className="winner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
                <span>Ganadores</span>
              </div>
              <div className="list-content">
                {winners.length > 0 ? (
                  winners.map((winner, index) => (
                    <div key={index} className="winner-item">
                      <span className="winner-number">{index + 1}</span>
                      <span className="winner-name">{winner.name}</span>
                    </div>
                  ))
                ) : (
                  <p className="empty-message">Aún no hay ganadores</p>
                )}
              </div>
            </div>
            
            {/* Lista de participantes */}
            <div className="participants-list">
              <div className="list-header">
                <span>Participantes</span>
                <span className="count-badge">{participants.length} total</span>
              </div>
              
              {participants.length > 0 ? (
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
                        onClick={() => setSearchTerm("")}
                        aria-label="Limpiar búsqueda"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  
                  <div className="participants-grid">
                    {filteredParticipants.length > 0 ? (
                      filteredParticipants.map(participant => (
                        <div 
                          key={participant.id} 
                          className={`participant-item ${
                            participant.isWinner 
                              ? 'participant-winner' 
                              : !participant.active 
                                ? 'participant-inactive' 
                                : ''
                          }`}
                        >
                          <span className={`participant-name ${participant.isWinner ? 'winner-text' : ''}`}>
                            {participant.name}
                            {participant.isWinner && <span className="winner-crown">👑</span>}
                          </span>
                          
                          <label className="toggle-switch">
                            <input 
                              type="checkbox" 
                              checked={participant.active}
                              onChange={() => toggleParticipant(participant.id)}
                              disabled={participant.isWinner}
                            />
                            <span className="toggle-slider"></span>
                          </label>
                        </div>
                      ))
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
      
      {/* Footer con redes sociales y ayuda */}
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-company">
            <img src="camp300.png" alt="Logo de la empresa" className="footer-logo" />
            <p>Centro de Arbitraje y Mediación Paraguay (CAMP) &copy; {new Date().getFullYear()}</p>
          </div>
          
          <div className="footer-links">
            <div className="footer-section">
              <h3>Enlaces útiles</h3>
              <ul>
                <li><a href="#about">Sobre nosotros</a></li>
                <li><a href="#contact">Contacto</a></li>
                <li><a href="#help">Ayuda</a></li>
                <li><a href="#terms">Términos y condiciones</a></li>
              </ul>
            </div>
            
            <div className="footer-section">
              <h3>Síguenos</h3>
              <div className="social-icons">
                <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="social-icon facebook">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
                  </svg>
                </a>
                <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="social-icon twitter">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"></path>
                  </svg>
                </a>
                <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="social-icon instagram">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                  </svg>
                </a>
                <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="social-icon linkedin">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
                    <rect x="2" y="9" width="4" height="12"></rect>
                    <circle cx="4" cy="4" r="2"></circle>
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
        
        <div className="footer-bottom">
          <p>Desarrollado con ♥ | <a href="#support" className="support-link">¿Necesitas ayuda?</a></p>
        </div>
      </footer>
    </div>
  );
};

export default SorteoApp;