namespace RoofingCrm.Models;

public sealed class CrmLead
{
    public Guid Id { get; set; }

    public string PropertyId { get; set; } = string.Empty;

    public string Address { get; set; } = string.Empty;

    public string City { get; set; } = string.Empty;

    public double Latitude { get; set; }

    public double Longitude { get; set; }

    public int RoofAgeYears { get; set; }

    public bool PermitOpen { get; set; }

    public int PermitOpenYears { get; set; }

    public string PermitStatus { get; set; } = string.Empty;

    public string ContractorName { get; set; } = string.Empty;

    public string BbbRating { get; set; } = string.Empty;

    public List<string> LeadSignals { get; set; } = [];

    public CrmLeadStatus Status { get; set; } = CrmLeadStatus.New;

    public string? Notes { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}