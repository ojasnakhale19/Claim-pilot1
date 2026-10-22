import { useLocation } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/Avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/DropdownMenu';
import {
  Search,
  Bell,
  HelpCircle,
  User,
  Settings,
  LogOut,
  ChevronDown,
} from 'lucide-react';

const breadcrumbs: Record<string, string[]> = {
  '/': ['Overview'],
  '/claims': ['Overview', 'Claims'],
  '/submit-claim': ['Overview', 'New Claim'],
  '/new-assessment': ['Overview', 'New Assessment'],
  '/settlement': ['Overview', 'Settlement Workspace'],
  '/review-queue': ['Overview', 'Review Queue'],
  '/analytics': ['Overview', 'Analytics'],
  '/settings': ['Overview', 'Settings'],
};

export function Topbar() {
  const location = useLocation();
  const pathSegments = location.pathname.split('/').filter(Boolean);
  
  const getBreadcrumb = () => {
    if (breadcrumbs[location.pathname]) {
      return breadcrumbs[location.pathname];
    }
    if (pathSegments.length > 0 && pathSegments[0] === 'claims' && pathSegments[1]) {
      return ['Overview', 'Claims', `Claim ${pathSegments[1]}`];
    }
    if (pathSegments.length > 0 && pathSegments[0] === 'assessment' && pathSegments[1]) {
      return ['Overview', 'New Assessment', 'Assessment Results'];
    }
    return ['Overview'];
  };

  const breadcrumbItems = getBreadcrumb();

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="flex h-full items-center justify-between px-6 gap-4">
        <nav className="flex-1 flex items-center gap-2 text-sm" aria-label="Breadcrumb">
          <ol className="flex items-center gap-2" role="list">
            {breadcrumbItems.map((item, index) => (
              <li key={item} className="flex items-center gap-2">
                {index > 0 && (
                  <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
                )}
                {index === breadcrumbItems.length - 1 ? (
                  <span className="font-medium text-slate-900">{item}</span>
                ) : (
                  <span className="text-slate-500 hover:text-slate-700 cursor-pointer">{item}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex items-center gap-4">
          <div className="hidden md:block w-72">
            <Input
              type="search"
              placeholder="Search claims..."
              className="h-10 pl-10"
              aria-label="Search claims"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-10 w-10" aria-label="Notifications">
                  <Bell className="h-5 w-5" aria-hidden="true" />
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-danger-500" aria-label="3 unread notifications" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="p-3 hover:bg-slate-50">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100">
                      <Bell className="h-4 w-4 text-primary-600" aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">New claim assigned</p>
                      <p className="text-xs text-slate-500">CLM-2026-1049 has been assigned to you</p>
                      <p className="text-xs text-slate-400 mt-1">2 minutes ago</p>
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem className="p-3 hover:bg-slate-50">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-100">
                      <HelpCircle className="h-4 w-4 text-warning-600" aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">Escalation review needed</p>
                      <p className="text-xs text-slate-500">CLM-2026-1044 requires human review</p>
                      <p className="text-xs text-slate-400 mt-1">15 minutes ago</p>
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem className="p-3 hover:bg-slate-50">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-100">
                      <User className="h-4 w-4 text-success-600" aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">Settlement confirmed</p>
                      <p className="text-xs text-slate-500">CLM-2026-1045 settled at ₹5,800</p>
                      <p className="text-xs text-slate-400 mt-1">1 hour ago</p>
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-center text-primary-600">
                  View all notifications
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="Help">
              <HelpCircle className="h-5 w-5" aria-hidden="true" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-10 gap-2 px-3" aria-label="User menu">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=alex" alt="Alex Morgan" />
                    <AvatarFallback>AM</AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm font-medium text-slate-700">Alex Morgan</span>
                  <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
                </Button>
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
                <DropdownMenuItem className="text-danger-600 focus:text-danger-600">
                  <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}