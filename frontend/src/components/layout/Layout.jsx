import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Smartphone, Users, Megaphone, Bot, BookOpen, LogOut, Zap, Map, BarChart2, UserCheck, Inbox, GitBranch, Bell, ShieldCheck, ShirtIcon, Radio, Package, FileText } from 'lucide-react'
import useAuthStore from '../../store/authStore'
import clsx from 'clsx'
import { ScreencastProvider } from '../../contexts/ScreencastContext'
import FloatingScreencast from '../FloatingScreencast'

const navItem = (to, icon, label, end = false) => ({ to, icon, label, end })

const NAV = [
  navItem('/',              LayoutDashboard, 'Dashboard', true),
  navItem('/inbox-principal', Inbox,         'Inbox Principal'),
  navItem('/vendedores',    Smartphone,      'Líneas'),
  navItem('/clientes',      Users,           'Clientes'),
  navItem('/leads',         UserCheck,       'Leads'),
  navItem('/merchandising',  ShirtIcon,    'Merchandising'),
  navItem('/campanas',      Megaphone,       'Campañas'),
  navItem('/publicidad',    Radio,           'Publicidad'),
  navItem('/analisis',      BarChart2,       'Análisis Comercial'),
  navItem('/productos',     Package,         'Catálogo Productos'),
  navItem('/mapa',          Map,             'Mapa de zonas'),
]

const NAV_CONFIG = [
  navItem('/flujos',          GitBranch,   'Flujos de trabajo'),
  navItem('/plantillas',      FileText,    'Plantillas WhatsApp'),
  navItem('/ia-config',       Bot,         'Configuración IA'),
  navItem('/notificaciones',  Bell,        'Notificaciones'),
  navItem('/quick-replies',   Zap,         'Respuestas rápidas'),
  navItem('/knowledge',       BookOpen,    'Base FAQ'),
  navItem('/auditoria',       ShieldCheck, 'Auditoría Sistema'),
]

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  return (
    <ScreencastProvider>
    <div className="flex h-screen bg-gray-50">
      <aside className="w-56 bg-white border-r border-gray-100 flex flex-col shrink-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <h1 className="text-base font-bold text-brand">AGROFER CRM</h1>
          <p className="text-xs text-gray-400 mt-0.5">Panel de control</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive ? 'bg-brand/10 text-brand' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}>
              <Icon size={17} />
              <span className="flex-1">{label}</span>
            </NavLink>
          ))}

          <div className="pt-4 pb-1 px-3">
            <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Ajustes</p>
          </div>
          {NAV_CONFIG.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive ? 'bg-brand/10 text-brand' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}>
              <Icon size={17} /> {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-gray-100">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-brand/20 flex items-center justify-center text-brand font-bold text-xs">
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <p className="text-sm font-medium truncate">{user?.name}</p>
          </div>
          <button onClick={() => { logout(); navigate('/login') }}
            className="flex items-center gap-2 px-3 py-2 w-full rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors">
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-auto min-h-0 min-w-0">
        <Outlet />
      </main>

      <FloatingScreencast />
    </div>
    </ScreencastProvider>
  )
}
