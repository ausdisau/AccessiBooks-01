import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Building2, Users, UserPlus, Trash2, Shield, Crown,
  BarChart3, Loader2, GraduationCap, Briefcase, CheckCircle
} from "lucide-react";

const TIERS = {
  education: {
    name: "Education",
    price: "$99/mo",
    seats: 50,
    icon: GraduationCap,
    features: ["Up to 50 seats", "Ad-free for all members", "Premium features included", "Admin analytics dashboard"],
  },
  enterprise: {
    name: "Enterprise",
    price: "$299/mo",
    seats: 200,
    icon: Briefcase,
    features: ["Up to 200 seats", "Ad-free for all members", "Premium features included", "Admin analytics dashboard", "Priority support"],
  },
};

export default function EnterprisePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [inviteEmail, setInviteEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [selectedTier, setSelectedTier] = useState<"education" | "enterprise">("education");

  const membersQuery = useQuery({
    queryKey: ["/api/enterprise/members"],
    enabled: !!user,
  });

  const analyticsQuery = useQuery({
    queryKey: ["/api/enterprise/analytics"],
    enabled: !!user && !!(membersQuery.data as any)?.account?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/enterprise/create", {
        orgName,
        contactEmail,
        tier: selectedTier,
      });
    },
    onSuccess: () => {
      toast({ title: "Organization created!" });
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/members"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create organization", description: err.message, variant: "destructive" });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/enterprise/invite", { email: inviteEmail });
    },
    onSuccess: () => {
      toast({ title: "Member invited!" });
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/members"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to invite", description: err.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (memberId: string) => {
      return apiRequest("DELETE", `/api/enterprise/members/${memberId}`);
    },
    onSuccess: () => {
      toast({ title: "Member removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/members"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to remove member", description: err.message, variant: "destructive" });
    },
  });

  const data = membersQuery.data as any;
  const account = data?.account;
  const members = data?.members || [];
  const analytics = analyticsQuery.data as any;
  const isAdmin = members.some((m: any) => m.userId === user?.id && m.role === "admin");

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Please sign in to access enterprise features.</p>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        <div className="text-center space-y-2">
          <Building2 className="h-12 w-12 mx-auto text-primary" />
          <h1 className="text-3xl font-bold">Enterprise & Education Plans</h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Give your team or school access to the full AccessiBooks experience with Premium features for every member.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {(Object.entries(TIERS) as [string, typeof TIERS.education][]).map(([key, tier]) => {
            const Icon = tier.icon;
            const isSelected = selectedTier === key;
            return (
              <Card
                key={key}
                className={`cursor-pointer transition-all ${isSelected ? "ring-2 ring-primary" : "hover:shadow-lg"}`}
                onClick={() => setSelectedTier(key as "education" | "enterprise")}
              >
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Icon className="h-8 w-8 text-primary" />
                    <div>
                      <CardTitle>{tier.name}</CardTitle>
                      <CardDescription className="text-2xl font-bold text-foreground">{tier.price}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {tier.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create Your Organization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Organization Name</label>
                <Input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Acme University"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Contact Email</label>
                <Input
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="admin@acme.edu"
                  type="email"
                />
              </div>
            </div>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !orgName || !contactEmail}
              className="w-full"
            >
              {createMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
              ) : (
                `Create ${TIERS[selectedTier].name} Account - ${TIERS[selectedTier].price}`
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            {account.orgName}
          </h1>
          <p className="text-muted-foreground">
            {account.tier === "enterprise" ? "Enterprise" : "Education"} Plan - {account.currentSeats}/{account.maxSeats} seats used
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          <Crown className="h-3 w-3 mr-1" />
          {account.tier === "enterprise" ? "$299/mo" : "$99/mo"}
        </Badge>
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members"><Users className="h-4 w-4 mr-1" /> Members</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="h-4 w-4 mr-1" /> Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4">
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Invite Member</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@email.com"
                    type="email"
                    className="flex-1"
                  />
                  <Button
                    onClick={() => inviteMutation.mutate()}
                    disabled={inviteMutation.isPending || !inviteEmail}
                  >
                    {inviteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4 mr-1" />}
                    Invite
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            {members.map((member: any) => (
              <Card key={member.id}>
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      {member.role === "admin" ? <Shield className="h-4 w-4 text-primary" /> : <Users className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="font-medium">{member.name || member.email || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={member.role === "admin" ? "default" : "secondary"}>
                      {member.role}
                    </Badge>
                    {isAdmin && member.userId !== user?.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMutation.mutate(member.id)}
                        disabled={removeMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          {analytics ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-3xl font-bold">{analytics.totalMembers}</p>
                  <p className="text-sm text-muted-foreground">Total Members</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-3xl font-bold">{analytics.maxSeats}</p>
                  <p className="text-sm text-muted-foreground">Max Seats</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-3xl font-bold capitalize">{analytics.tier}</p>
                  <p className="text-sm text-muted-foreground">Plan</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-3xl font-bold">${((analytics.amountCents || 0) / 100).toFixed(0)}/mo</p>
                  <p className="text-sm text-muted-foreground">Monthly Cost</p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}