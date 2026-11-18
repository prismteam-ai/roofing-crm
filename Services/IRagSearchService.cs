using RoofingCrm.Models.Requests;
using RoofingCrm.Models.Responses;

namespace RoofingCrm.Services;

public interface IRagSearchService
{
    Task<SearchPromptResponse> SearchAsync(SearchPromptRequest request, CancellationToken cancellationToken = default);
}