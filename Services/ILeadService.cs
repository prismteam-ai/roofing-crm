using RoofingCrm.Models;
using RoofingCrm.Models.Requests;

namespace RoofingCrm.Services;

public interface ILeadService
{
    Task<IReadOnlyList<CrmLead>> GetAllAsync(CancellationToken cancellationToken = default);

    Task<CrmLead?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);

    Task<CrmLead> CreateAsync(CreateCrmLeadRequest request, CancellationToken cancellationToken = default);

    Task<CrmLead?> UpdateAsync(Guid id, UpdateCrmLeadRequest request, CancellationToken cancellationToken = default);

    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}