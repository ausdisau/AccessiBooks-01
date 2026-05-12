import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Users, Plus, Trash2, Mail, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface FamilyMember {
  id: string;
  userId: string;
  role: "owner" | "member";
  user: {
    username: string;
    email: string;
  };
}

interface FamilyAccount {
  id: string;
  planName: string;
  maxMembers: number;
  isActive: boolean;
}

interface FamilyData {
  account: FamilyAccount;
  members: FamilyMember[];
}

export function FamilyPlan() {
  const { toast } = useToast();
  const [inviteEmail, setInviteEmail] = useState("");

  // Fetch family plan data
  const { data: familyData, isLoading, error } = useQuery<FamilyData>({
    queryKey: ["/api/family"],
    retry: false,
  });

  // Mutation to create family plan
  const createFamilyMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/family/create"),
    onSuccess: () => {
      toast({
        title: "Family Plan Created",
        description: "Your family plan has been successfully created!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/family"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create family plan",
        variant: "destructive",
      });
    },
  });

  // Mutation to invite member
  const inviteMemberMutation = useMutation({
    mutationFn: (email: string) =>
      apiRequest("POST", "/api/family/invite", { email }),
    onSuccess: () => {
      toast({
        title: "Invitation Sent",
        description: "Family member invitation has been sent!",
      });
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["/api/family"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send invitation",
        variant: "destructive",
      });
    },
  });

  // Mutation to remove member
  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) =>
      apiRequest("DELETE", `/api/family/members/${memberId}`),
    onSuccess: () => {
      toast({
        title: "Member Removed",
        description: "Family member has been removed",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/family"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove member",
        variant: "destructive",
      });
    },
  });

  const hasFamily = !error && familyData?.account?.isActive;
  const currentMembers = familyData?.members?.length || 0;
  const maxMembers = familyData?.account?.maxMembers || 5;

  if (isLoading) {
    return (
      <Card className="border-border">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Promo card - no family plan
  if (!hasFamily) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Family Plan</CardTitle>
              <CardDescription>$7.99/month</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">Features included:</h4>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-sm">
                <span className="text-primary">✓</span>
                <span>Up to 5 members</span>
              </li>
              <li className="flex items-center gap-2 text-sm">
                <span className="text-primary">✓</span>
                <span>Shared library access</span>
              </li>
              <li className="flex items-center gap-2 text-sm">
                <span className="text-primary">✓</span>
                <span>Individual progress tracking</span>
              </li>
              <li className="flex items-center gap-2 text-sm">
                <span className="text-primary">✓</span>
                <span>Premium features for all members</span>
              </li>
            </ul>
          </div>
          <Button
            onClick={() => createFamilyMutation.mutate()}
            disabled={createFamilyMutation.isPending}
            className="w-full"
            size="lg"
          >
            {createFamilyMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Start Family Plan
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Family management card
  return (
    <div className="space-y-6">
      {/* Family Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-2">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>{familyData?.account?.planName || "Family Plan"}</CardTitle>
                <CardDescription>
                  {currentMembers}/{maxMembers} members
                </CardDescription>
              </div>
            </div>
            <Badge variant="default">Active</Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Invite Member Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite Family Member</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (inviteEmail) {
                inviteMemberMutation.mutate(inviteEmail);
              }
            }}
            className="flex gap-2"
          >
            <Input
              type="email"
              placeholder="Enter email address"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              disabled={inviteMemberMutation.isPending}
            />
            <Button
              type="submit"
              disabled={!inviteEmail || inviteMemberMutation.isPending}
            >
              {inviteMemberMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Invite
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Members List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Family Members</CardTitle>
        </CardHeader>
        <CardContent>
          {familyData?.members && familyData.members.length > 0 ? (
            <div className="space-y-3">
              {familyData.members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {member.user.username || member.user.email}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {member.user.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <Badge
                      variant={member.role === "owner" ? "default" : "secondary"}
                    >
                      {member.role === "owner" ? "Owner" : "Member"}
                    </Badge>
                    {member.role === "owner" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMemberMutation.mutate(member.id)}
                        disabled={removeMemberMutation.isPending}
                        className="text-destructive hover:text-destructive"
                      >
                        {removeMemberMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              No family members yet. Invite someone to get started!
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
