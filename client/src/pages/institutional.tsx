import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Users, BarChart3, GraduationCap, Mail, Loader2, CheckCircle, Briefcase } from "lucide-react";

const PLANS = [
  {
    key: "education",
    name: "Education",
    price: "$99/mo",
    seats: 50,
    icon: GraduationCap,
    features: ["Up to 50 seats", "Ad-free for all members", "Premium features included", "Admin analytics dashboard"],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "$299/mo",
    seats: 200,
    icon: Briefcase,
    features: ["Up to 200 seats", "Ad-free for all members", "Premium features included", "Admin analytics dashboard", "Priority support", "Custom branding"],
  },
];

export default function InstitutionalPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [orgName, setOrgName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [orgType, setOrgType] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("education");

  const membersQuery = useQuery({
    queryKey: ["/api/institutional/members"],
    enabled: !!user,
  });

  const createOrgMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/institutional/create", {
        orgName,
        contactEmail,
        orgType,
        plan: selectedPlan,
      });
    },
    onSuccess: () => {
      toast({ title: "Organization created successfully!" });
      queryClient.invalidateQueries({ queryKey: ["/api/institutional/members"] });
      setOrgName("");
      setContactEmail("");
      setOrgType("");
    },
    onError: (err: any) => {
      toast({ title: "Failed to create organization", description: err.message, variant: "destructive" });
    },
  });

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Building2 className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-medium text-foreground dark:text-foreground">Sign in to access institutional features</p>
        <p className="text-muted-foreground text-sm">You need an account to manage institutional plans.</p>
      </div>
    );
  }

  const data = membersQuery.data as any;
  const members = data?.members || [];
  const hasOrg = !!data?.account;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold flex items-center gap-3 text-foreground dark:text-foreground">
            <Building2 className="h-8 w-8 text-primary" />
            Institutional Account
          </h1>
          <p className="text-muted-foreground">Manage plans for schools, libraries, and nonprofits</p>
        </div>
        <Select value={selectedPlan} onValueChange={setSelectedPlan}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="education">Education</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {PLANS.map((plan) => {
          const Icon = plan.icon;
          const isSelected = selectedPlan === plan.key;
          return (
            <Card
              key={plan.key}
              className={`cursor-pointer transition-all bg-card dark:bg-card ${isSelected ? "ring-2 ring-primary" : "hover:shadow-lg dark:hover:shadow-primary/5"}`}
              onClick={() => setSelectedPlan(plan.key)}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>{plan.name}</CardTitle>
                    <CardDescription className="text-2xl font-bold text-foreground dark:text-foreground">
                      {plan.price}
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="secondary" className="w-fit mt-2">
                  {plan.seats} seats included
                </Badge>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-foreground dark:text-foreground">
                      <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-card dark:bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Create Organization
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground dark:text-foreground">Organization Name</label>
              <Input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Springfield Library"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground dark:text-foreground">Contact Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="admin@school.edu"
                  type="email"
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground dark:text-foreground">Organization Type</label>
              <Select value={orgType} onValueChange={setOrgType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="school">School</SelectItem>
                  <SelectItem value="library">Library</SelectItem>
                  <SelectItem value="nonprofit">Nonprofit</SelectItem>
                  <SelectItem value="university">University</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={() => createOrgMutation.mutate()}
            disabled={createOrgMutation.isPending || !orgName || !contactEmail || !orgType}
            className="w-full"
          >
            {createOrgMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
            ) : (
              "Create Organization"
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-card dark:bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Members
          </CardTitle>
        </CardHeader>
        <CardContent>
          {membersQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !hasOrg ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No organization found. Create one above to start managing members.</p>
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No members yet. Invite your team to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {members.map((member: any) => (
                <div key={member.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 dark:bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground dark:text-foreground">{member.name || member.email}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <Badge variant={member.role === "admin" ? "default" : "secondary"}>
                    {member.role}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card dark:bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Analytics Preview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-muted/50 dark:bg-muted/20 text-center">
              <p className="text-2xl font-bold text-foreground dark:text-foreground">—</p>
              <p className="text-sm text-muted-foreground">Active Listeners</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 dark:bg-muted/20 text-center">
              <p className="text-2xl font-bold text-foreground dark:text-foreground">—</p>
              <p className="text-sm text-muted-foreground">Books Accessed</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 dark:bg-muted/20 text-center">
              <p className="text-2xl font-bold text-foreground dark:text-foreground">—</p>
              <p className="text-sm text-muted-foreground">Hours Listened</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Detailed analytics will be available once your organization is active with members.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
