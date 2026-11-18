namespace RoofingCrm.Models.Requests;

public sealed class UpdateCrmLeadRequest
{
    public CrmLeadStatus? Status { get; set; }

    public string? Notes { get; set; }
}