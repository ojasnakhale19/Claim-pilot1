import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  MessageSquare,
  ClipboardList,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  User,
  LogOut,
  Bell,
  HelpCircle,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/Avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/DropdownMenu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/Tooltip';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
}

const navigation = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Claims', href: '/claims', icon: FileText },
  { name: 'New Claim', href: '/submit-claim', icon: PlusCircle },
  { name: 'New Assessment', href: '/new-assessment', icon: PlusCircle },
  { name: 'Settlement Workspace', href: '/settlement', icon: MessageSquare },
  { name: 'Review Queue', href: '/review-queue', icon: ClipboardList },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar({ collapsed, onToggle, className }: SidebarProps) {
  const location = useLocation();

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-screen border-r border-border bg-white transition-all duration-300 ease-in-out',
          collapsed ? 'w-20' : 'w-72',
          className
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between px-4 border-b border-border">
            {!collapsed && (
              <NavLink
                to="/"
                className="flex items-center gap-2 font-semibold text-lg text-slate-900"
                aria-label="ClaimPilot AI Home"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-600">
                  <LayoutDashboard className="h-5 w-5 text-white" aria-hidden="true" />
                </div>
                <span>ClaimPilot AI</span>
              </NavLink>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggle}
                  className={cn(
                    'h-8 w-8 rounded-lg',
                    collapsed && 'ml-auto'
                  )}
                  aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              </TooltipContent>
            </Tooltip>
          </div>

          <nav className="flex-1 overflow-y-auto p-3 space-y-1" role="navigation" aria-label="Main">
            <ul className="space-y-1" role="list">
              {navigation.map((item) => {
                const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href));
                return (
                  <li key={item.name}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <NavLink
                          to={item.href}
                          className={cn(
                            'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
                            isActive
                              ? 'bg-primary-50 text-primary-700'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                            collapsed && 'justify-center px-2'
                          )}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                          {!collapsed && <span>{item.name}</span>}
                        </NavLink>
                      </TooltipTrigger>
                      <TooltipContent side="right" sideOffset={8}>
                        {collapsed ? item.name : ''}
                      </TooltipContent>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="border-t border-border p-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                        'hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
                        collapsed && 'justify-center px-2'
                      )}
                      aria-label={collapsed ? 'User menu' : 'Alex Morgan, Senior Claims Adjuster'}
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=alex" alt="Alex Morgan" />
                        <AvatarFallback>AM</AvatarFallback>
                      </Avatar>
                      {!collapsed && (
                        <div className="flex-1 min-w-0 text-left">
                          <p className="truncate font-medium text-slate-900">Alex Morgan</p>
                          <p className="truncate text-xs text-slate-500">Senior Claims Adjuster</p>
                        </div>
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium text-slate-900">Alex Morgan</p>
                        <p className="text-xs text-slate-500">alex.morgan@claimpilot.ai</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      <User className="mr-2 h-4 w-4" aria-hidden="true" />
                      Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      <Bell className="mr-2 h-4 w-4" aria-hidden="true" />
                      Notifications
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <HelpCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                      Help & Support
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-danger-600 focus:text-danger-600">
                      <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {collapsed ? 'Alex Morgan' : ''}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}