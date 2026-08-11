import { useEffect, Component } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div className="p-8 max-w-2xl mx-auto">
        <h2 className="text-lg font-bold text-red-600 mb-2">Error en la aplicación</h2>
        <pre className="bg-red-50 border border-red-200 rounded-lg p-4 text-xs text-red-800 overflow-auto whitespace-pre-wrap">
          {this.state.error?.toString()}{'\n\n'}{this.state.error?.stack}
        </pre>
        <button onClick={() => this.setState({ error: null })} className="mt-4 px-4 py-2 bg-brand text-white rounded-lg text-sm">
          Reintentar
        </button>
      </div>
    )
    return this.props.children
  }
}
import useAuthStore from './store/authStore'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import AlertasGlobales from './components/AlertasGlobales'
import DashboardPage from './pages/DashboardPage'
import VendedoresPage from './pages/VendedoresPage'
import VendedorDetailPage from './pages/VendedorDetailPage'
import ClientesPage from './pages/ClientesPage'
import BroadcastPage from './pages/BroadcastPage'
import BroadcastDetailPage from './pages/BroadcastDetailPage'
import LeadsPage from './pages/LeadsPage'
import NotificacionesPage from './pages/NotificacionesPage'
import FlujosPage from './pages/FlujosPage'
import PlantillasWhatsAppPage from './pages/PlantillasWhatsAppPage'
import FlujoEditorPage from './pages/FlujoEditorPage'
import InboxPrincipalPage from './pages/InboxPrincipalPage'
import MapaPage from './pages/MapaPage'
import AnalisisComercialPage from './pages/AnalisisComercialPage'
import ProductosCatalogoPage from './pages/ProductosCatalogoPage'
import AIConfigPage from './pages/AIConfigPage'
import KnowledgePage from './pages/KnowledgePage'
import QuickRepliesPage from './pages/QuickRepliesPage'
import AutomationsPage from './pages/AutomationsPage'
import AuditoriaPage from './pages/AuditoriaPage'
import MerchandisingPage from './pages/MerchandisingPage'
import PublicidadPage from './pages/PublicidadPage'

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const { fetchMe, isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (isAuthenticated) fetchMe()
  }, [])

  return (
    <BrowserRouter>
      <AlertasGlobales />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="vendedores" element={<VendedoresPage />} />
          <Route path="vendedores/:id" element={<VendedorDetailPage />} />
          <Route path="clientes" element={<ClientesPage />} />
          <Route path="broadcast" element={<BroadcastPage />} />
          <Route path="broadcast/:id" element={<BroadcastDetailPage />} />
          <Route path="inbox-principal" element={<ErrorBoundary><InboxPrincipalPage /></ErrorBoundary>} />
          <Route path="flujos" element={<FlujosPage />} />
          <Route path="flujos/:id" element={<FlujoEditorPage />} />
          <Route path="plantillas" element={<PlantillasWhatsAppPage />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="mapa" element={<MapaPage />} />
          <Route path="analisis" element={<AnalisisComercialPage />} />
          <Route path="productos" element={<ProductosCatalogoPage />} />
          <Route path="ia-config" element={<AIConfigPage />} />
          <Route path="notificaciones" element={<NotificacionesPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="quick-replies" element={<QuickRepliesPage />} />
          <Route path="automations" element={<AutomationsPage />} />
          <Route path="auditoria" element={<AuditoriaPage />} />
          <Route path="merchandising" element={<MerchandisingPage />} />
          <Route path="publicidad" element={<PublicidadPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
